const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const logger = require("../main/logger");
const ruleSync = require("./ruleSync");
const http = require("http");

// Основные переменные
let _isRunning = false;
let rules = [];
let recentActivities = [];
let originalHostsContent = "";
let blockedDomains = [];
let allowedDomains = [];
let currentUser = null;
let monitoringServer = null;
let blockedSubnets = [];
let dnsMonitoringInterval = null;

const MAX_ACTIVITIES = 100;
let hostsFileUpdateLock = false;
let lastKnownBlockedDomains = [];

// Выполнение команд
const execCommand = (command) => {
  return new Promise((resolve) => {
    exec(command, { encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        output: stdout,
        error: error?.message || stderr,
      });
    });
  });
};

// Путь к hosts файлу
const getHostsPath = () => {
  switch (os.platform()) {
    case "win32":
      return "C:\\Windows\\System32\\drivers\\etc\\hosts";
    case "darwin":
    case "linux":
      return "/etc/hosts";
    default:
      throw new Error("Unsupported platform");
  }
};

// Инициализация
const init = async (userRules, user) => {
  try {
    rules = userRules || [];
    recentActivities = [];
    currentUser = user;

    const hostsPath = getHostsPath();
    logger.info(`Hosts file: ${hostsPath}`);

    try {
      originalHostsContent = fs.readFileSync(hostsPath, "utf8");
      logger.info("Original hosts file saved");
    } catch (error) {
      logger.error(`Error reading hosts file: ${error.message}`);
      return false;
    }

    updateBlockedAndAllowedDomains();
    logger.info(`Network monitor initialized - Blocked domains: ${blockedDomains.length}, Blocked subnets: ${blockedSubnets.length}`);
    return true;
  } catch (error) {
    logger.error(`Init error: ${error.message}`);
    return false;
  }
};

// Извлечение домена
const extractDomain = (url) => {
  try {
    if (!url || typeof url !== "string") return "";

    // IP subnet
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(url)) {
      return url;
    }

    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      fullUrl = `http://${url}`;
    }

    try {
      const urlObj = new URL(fullUrl);
      let domain = urlObj.hostname;
      if (domain.startsWith("www.")) {
        domain = domain.substring(4);
      }
      return domain;
    } catch (urlError) {
      return url
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
    }
  } catch (error) {
    return "";
  }
};

const startRealTimeNetworkMonitoring = () => {
  logger.info('🔍 Network monitoring started - checking every 5 seconds');
  
  dnsMonitoringInterval = setInterval(() => {
    if (!_isRunning) {
      clearInterval(dnsMonitoringInterval);
      return;
    }
    
    monitorNetworkAttempts();
  }, 5000);
};

const getCurrentAllBrowserDomains = () => {
  return new Promise((resolve) => {
    const command = 'powershell -Command "Get-Process | Where-Object {$_.ProcessName -match \'chrome|firefox|msedge|iexplore\'} | Select-Object ProcessName,MainWindowTitle"';
    
    exec(command, (error, stdout) => {
      if (!error && stdout) {
        const titles = stdout.toLowerCase();
        const detectedDomains = [];
        
        // Находим ВСЕ заблокированные домены в заголовках
        for (const domain of blockedDomains) {
          const cleanDomain = domain.replace('.com', '').replace('.org', '').replace('.net', '');
          
          if (titles.includes(domain.toLowerCase()) || 
              titles.includes(cleanDomain.toLowerCase()) ||
              titles.includes(`www.${domain}`.toLowerCase())) {
            detectedDomains.push(domain);
          }
        }
        
        resolve(detectedDomains);
      } else {
        resolve([]);
      }
    });
  });
};

const monitorNetworkAttempts = async () => {
  try {
    // Получаем ВСЕ активные заблокированные домены
    const activeDomains = await getCurrentAllBrowserDomains();
    
    if (activeDomains.length > 0) {
      // Сохраняем все активные домены
      global.allActiveBrowserDomains = activeDomains;
      global.allActiveDomainsTime = Date.now();
      
      // Логируем только при изменении списка доменов
      const sessionKey = `active_domains_${activeDomains.sort().join('_')}`;
      const now = Date.now();
      
      if (!global.lastDomainSets) global.lastDomainSets = {};
      
      if (!global.lastDomainSets[sessionKey] || (now - global.lastDomainSets[sessionKey]) > 30000) {
        global.lastDomainSets[sessionKey] = now;
        
        if (activeDomains.length === 1) {
          logger.info(`🚨 BLOCKED SITE DETECTED: ${activeDomains[0]}`);
        } else {
          logger.info(`🚨 MULTIPLE BLOCKED SITES DETECTED: ${activeDomains.join(', ')}`);
        }
        logger.info(`   User: ${currentUser ? currentUser.email : 'Unknown'}`);
        logger.info(`   Time: ${new Date().toLocaleString()}`);
      }
    } else {
      // Если нет активных доменов - сбрасываем
      global.allActiveBrowserDomains = [];
      global.lastDomainSets = {};
    }
    
    // Мониторинг соединений остается
    exec('netstat -n | findstr 127.0.0.1', (error, stdout) => {
      if (!error && stdout) {
        parseLocalConnections(stdout);
      }
    });
  } catch (error) {
    logger.error(`Network monitoring error: ${error.message}`);
  }
};

const parseLocalConnections = (netstatOutput) => {
  const lines = netstatOutput.split('\n');
  lines.forEach(line => {
    if ((line.includes('127.0.0.1:80') || line.includes('127.0.0.1:443')) && 
        !line.includes('127.0.0.1:8000') &&
        (line.includes('ESTABLISHED') || line.includes('SYN_SENT'))) {
            
      // Определяем наиболее вероятный домен
      const attemptedDomain = getMostLikelyBlockedDomain();
      
      if (attemptedDomain !== 'blocked-website') {
        global.lastKnownDomain = attemptedDomain;
        global.lastKnownDomainTime = Date.now();
      }

      const currentTime = new Date();
      const lastLogKey = `blocked_connection_${attemptedDomain}`;
      const now = Date.now();
      
      if (!global.lastLogTimes) global.lastLogTimes = {};
      
      // Дедуплицирование - один лог каждые 30 секунд для конкретного домена
      if (global.lastLogTimes[lastLogKey] && (now - global.lastLogTimes[lastLogKey]) < 30000) {
        return;
      }
      
      global.lastLogTimes[lastLogKey] = now;
      
      // Создаем ЧИСТЫЙ лог без спама
      logger.info(`🚫 ACCESS BLOCKED: ${attemptedDomain}`);
      logger.info(`   Type: HTTPS_CONNECTION`);
      logger.info(`   User: ${currentUser ? currentUser.email : 'Unknown'}`);
      logger.info(`   Time: ${currentTime.toLocaleString()}`);
      
      const activity = {
        timestamp: currentTime,
        type: "network",
        resource: attemptedDomain,
        blocked: true,
        protocol: 'HTTPS_CONNECTION',
        ruleName: 'Access Control',
        description: `User tried to access ${attemptedDomain} - blocked`,
        user_email: currentUser ? currentUser.email : null,
        target_info: '127.0.0.1'
      };
      
      addActivity(activity);
      
      // Отправка на платформу
      if (typeof ruleSync.sendActivityLogs === 'function') {
        try {
          ruleSync.sendActivityLogs([activity], null, null);
        } catch (sendError) {
          logger.warn(`Failed to send log: ${sendError.message}`);
        }
      }
    }
  });
};

const getMostLikelyBlockedDomain = () => {
  const now = Date.now();
  
  // 1. HTTP запрос (100% точность)
  if (global.lastHTTPDomain && (now - global.lastHTTPTime) < 15000) {
    return global.lastHTTPDomain.replace(/^www\./, '');
  }
  
  // 2. Если есть активные домены в браузере
  if (global.allActiveBrowserDomains && global.allActiveBrowserDomains.length > 0 && 
      (now - global.allActiveDomainsTime) < 15000) {
    
    if (global.allActiveBrowserDomains.length === 1) {
      // Один домен - используем его
      return global.allActiveBrowserDomains[0];
    } else {
      // Несколько доменов - возвращаем все
      return `multiple-blocked-sites (${global.allActiveBrowserDomains.join(', ')})`;
    }
  }
  
  // 3. Единственный домен в правилах
  if (blockedDomains.length === 1) {
    return blockedDomains[0];
  }
  
  // 4. Честно говорим что не знаем
  if (blockedDomains.length > 1) {
    return `blocked-site (${blockedDomains.join(' or ')})`;
  }
  
  return 'blocked-website';
};

const logAccessAttempt = (domain, targetInfo, attemptType) => {
  const currentTime = new Date();
  
  const lastLogKey = `${domain}_${attemptType}`;
  const now = Date.now();
  
  if (!global.lastLogTimes) global.lastLogTimes = {};
  
  if (global.lastLogTimes[lastLogKey] && (now - global.lastLogTimes[lastLogKey]) < 30000) {
    return;
  }
  
  global.lastLogTimes[lastLogKey] = now;
  
  logger.info(`🚫 ACCESS BLOCKED: ${domain}`);
  logger.info(`   Type: ${attemptType}`);
  logger.info(`   User: ${currentUser ? currentUser.email : 'Unknown'}`);
  logger.info(`   Time: ${currentTime.toLocaleString()}`);
  
  const activity = {
    timestamp: currentTime,
    type: "network",
    resource: domain,
    blocked: true,
    protocol: attemptType,
    ruleName: 'Access Control',
    description: `User tried to access ${domain} - blocked`,
    user_email: currentUser ? currentUser.email : null,
    target_info: targetInfo,
    attempt_type: attemptType
  };
  
  addActivity(activity);
  
  // Отправка на платформу
  if (typeof ruleSync.sendActivityLogs === 'function') {
    try {
      ruleSync.sendActivityLogs([activity], null, null);
    } catch (sendError) {
      logger.warn(`Failed to send log: ${sendError.message}`);
    }
  }
};

const createHTTPServer = () => {
  return new Promise((resolve, reject) => {
    try {
      monitoringServer = http.createServer(handleRequest);
      
      monitoringServer.listen(80, '0.0.0.0', () => {
        logger.info('HTTP server started on port 80');
        resolve();
      });

      monitoringServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error('Port 80 already in use');
        } else {
          logger.error(`HTTP server error: ${error.message}`);
        }
        reject(error);
      });

    } catch (error) {
      logger.error(`Failed to create HTTP server: ${error.message}`);
      reject(error);
    }
  });
};

// Обработка HTTP запросов остается
const handleRequest = (req, res) => {
  try {
    const hostHeader = req.headers.host || 'unknown';
    const clientIP = req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const requestUrl = req.url || '/';
    
    logger.info(`HTTP request received:`);
    logger.info(`  Domain: ${hostHeader}`);
    logger.info(`  URL: ${requestUrl}`);
    logger.info(`  Client IP: ${clientIP}`);
    
    // Сохраняем последний HTTP запрос
    global.lastHTTPDomain = hostHeader;
    global.lastHTTPTime = Date.now();
    
    let blockedDomain = 'unknown';
    
    if (hostHeader !== '127.0.0.1' && hostHeader !== 'localhost') {
      blockedDomain = hostHeader.replace(/^www\./, '');
      logger.info(`Blocked site access: User tried to visit ${blockedDomain}`);
    } else {
      blockedDomain = 'Direct Access';
      logger.info(`Direct access to server`);
    }
    
    const activity = {
      timestamp: new Date(),
      type: "network",
      resource: blockedDomain,
      blocked: true,
      protocol: 'HTTP',
      ruleName: 'HTTP Block',
      description: `User tried to visit ${blockedDomain} via HTTP - blocked`,
      user_email: currentUser ? currentUser.email : null,
      ip_address: clientIP,
      user_agent: userAgent
    };
    
    addActivity(activity);
    logger.info(`HTTP access logged: ${blockedDomain} - User: ${currentUser ? currentUser.email : 'unknown'}`);
    
    showBlockingPage(res, blockedDomain, hostHeader);
    
  } catch (error) {
    logger.error(`Request handling error: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
};

const showBlockingPage = (res, blockedDomain, originalHost) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Access Blocked - ${blockedDomain}</title>
        <meta charset="utf-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                margin: 0; padding: 50px; min-height: 100vh;
                display: flex; align-items: center; justify-content: center;
            }
            .container { 
                background: white; padding: 40px; border-radius: 20px; 
                box-shadow: 0 20px 60px rgba(0,0,0,0.2); text-align: center; 
                max-width: 600px; width: 100%;
            }
            .icon { font-size: 60px; margin-bottom: 15px; }
            h1 { font-size: 28px; margin-bottom: 10px; color: #2c3e50; }
            .domain-display {
                background: #2c3e50; color: white; padding: 20px;
                border-radius: 10px; margin: 25px 0;
                font-family: monospace; font-size: 18px; word-break: break-all;
            }
            .message {
                background: #d4edda; color: #155724; border: 1px solid #c3e6cb;
                padding: 20px; border-radius: 10px; margin: 25px 0;
            }
            .details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">🚫</div>
            <h1>ACCESS BLOCKED</h1>
            
            <div class="domain-display">
                ${originalHost}
            </div>
            
            <div class="message">
                <h3>Security Policy Enforced</h3>
                <p>This connection has been blocked according to your organization's internet usage policy.</p>
                <p>The request was intercepted and logged for security monitoring.</p>
            </div>
            
            <div class="details">
                <strong>Blocked Domain:</strong> ${blockedDomain}<br>
                <strong>Time:</strong> ${new Date().toLocaleString()}<br>
                <strong>User:</strong> ${currentUser ? currentUser.email : 'Unknown'}<br>
                <strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">BLOCKED & LOGGED</span>
            </div>
        </div>
    </body>
    </html>
  `);
};

const ipInSubnet = (ip, subnet) => {
  try {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      return false;
    }

    const [subnetIp, mask] = subnet.split("/");
    if (!mask) return ip === subnetIp;

    const ipNum = ip.split(".").reduce((acc, octet, i) => acc + (parseInt(octet) << (8 * (3 - i))), 0) >>> 0;
    const subnetNum = subnetIp.split(".").reduce((acc, octet, i) => acc + (parseInt(octet) << (8 * (3 - i))), 0) >>> 0;
    const maskBits = parseInt(mask);
    const maskNum = (0xffffffff << (32 - maskBits)) >>> 0;

    return (ipNum & maskNum) === (subnetNum & maskNum);
  } catch (error) {
    logger.error(`IP subnet check error: ${error.message}`);
    return false;
  }
};

const generateBlockedIPsFromSubnet = (subnet, allowedIPs) => {
  const [subnetBase, mask] = subnet.split("/");
  const [a, b, c, d] = subnetBase.split(".").map(Number);
  const blockedIPs = [];

  if (mask === "24") {
    for (let i = 1; i <= 254; i++) {
      const ip = `${a}.${b}.${c}.${i}`;
      if (!allowedIPs.includes(ip)) {
        blockedIPs.push(ip);
      }
    }
  } else if (mask === "32") {
    if (!allowedIPs.includes(subnetBase)) {
      blockedIPs.push(subnetBase);
    }
  }

  return blockedIPs;
};

const blockSubnetWithFirewall = async (subnet) => {
  return new Promise(async (resolve) => {
    logger.info(`Updating firewall rule for subnet: ${subnet}`);

    if (os.platform() !== "win32") {
      logger.warn("Firewall blocking only supported on Windows");
      resolve(true);
      return;
    }

    const allRelevantRules = [];

    rules.forEach((rule) => {
      const isRuleCurrentlyActive = ruleSync.isRuleActive(rule);
      
      if (!isRuleCurrentlyActive) return;

      if (rule.resources && rule.resources.websites) {
        rule.resources.websites.forEach((website) => {
          const domain = extractDomain(website);
          
          if (domain === subnet || (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain) && ipInSubnet(domain, subnet))) {
            allRelevantRules.push({
              rule: rule,
              domain: domain,
              isSubnet: domain === subnet,
              isIP: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)
            });
          }
        });
      }
    });

    allRelevantRules.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0));

    if (allRelevantRules.length === 0) {
      logger.info(`No rules for subnet ${subnet}, removing firewall rule`);
      const ruleName = `AccessControl_Block_${subnet.replace("/", "_")}`;
      await execCommand(`netsh advfirewall firewall delete rule name="${ruleName}"`);
      resolve(true);
      return;
    }

    const allowedIPs = [];
    const [subnetBase, mask] = subnet.split("/");
    const [a, b, c, d] = subnetBase.split(".").map(Number);

    let subnetShouldBeBlocked = false;
    let subnetDecisionRule = null;

    for (const ruleInfo of allRelevantRules) {
      if (ruleInfo.isSubnet && ruleInfo.domain === subnet) {
        subnetShouldBeBlocked = ruleInfo.rule.type === "block";
        subnetDecisionRule = ruleInfo.rule;
        logger.info(`Subnet ${subnet} will be ${ruleInfo.rule.type.toUpperCase()} by rule "${ruleInfo.rule.name}"`);
        break;
      }
    }

    if (!subnetShouldBeBlocked) {
      logger.info(`Subnet ${subnet} not blocked, removing firewall rule`);
      const ruleName = `AccessControl_Block_${subnet.replace("/", "_")}`;
      await execCommand(`netsh advfirewall firewall delete rule name="${ruleName}"`);
      resolve(true);
      return;
    }

    if (mask === "24") {
      for (let i = 1; i <= 254; i++) {
        const ip = `${a}.${b}.${c}.${i}`;
        
        const rulesForThisIP = [];
        
        for (const ruleInfo of allRelevantRules) {
          if (ruleInfo.isSubnet && ruleInfo.domain === subnet) {
            rulesForThisIP.push(ruleInfo);
          } else if (ruleInfo.isIP && ruleInfo.domain === ip) {
            rulesForThisIP.push(ruleInfo);
          }
        }
        
        if (rulesForThisIP.length > 0) {
          const topRuleForIP = rulesForThisIP[0];
          
          if (topRuleForIP.rule.type === "allow") {
            allowedIPs.push(ip);
          }
        }
      }
    }

    const blockedIPs = generateBlockedIPsFromSubnet(subnet, allowedIPs);
    
    if (blockedIPs.length === 0) {
      logger.info(`No IPs to block in subnet ${subnet}`);
      const ruleName = `AccessControl_Block_${subnet.replace("/", "_")}`;
      await execCommand(`netsh advfirewall firewall delete rule name="${ruleName}"`);
      resolve(true);
      return;
    }

    const remoteIPString = blockedIPs.join(",");
    logger.info(`Blocking ${blockedIPs.length} IPs in subnet ${subnet}`);

    const ruleName = `AccessControl_Block_${subnet.replace("/", "_")}`;

    await execCommand(`netsh advfirewall firewall delete rule name="${ruleName}"`);

    const createResult = await execCommand(
      `netsh advfirewall firewall add rule name="${ruleName}" dir=out action=block remoteip=${remoteIPString} protocol=any`
    );

    if (createResult.success) {
      logger.info(`Firewall rule created: blocked ${blockedIPs.length} IPs`);
    } else {
      logger.error(`Failed to create firewall rule: ${createResult.error}`);
    }

    resolve(true);
  });
};

const unblockSubnetWithFirewall = async (subnet) => {
  return new Promise(async (resolve) => {
    if (os.platform() === "win32") {
      logger.info(`Removing firewall rules for ${subnet}`);
      const ruleName = `AccessControl_Block_${subnet.replace("/", "_")}`;
      const result = await execCommand(`netsh advfirewall firewall delete rule name="${ruleName}"`);
      
      if (result.success) {
        logger.info(`Firewall rule removed for ${subnet}`);
      }
    }
    resolve(true);
  });
};

// Обновление доменов и подсетей
const updateBlockedAndAllowedDomains = () => {
  blockedDomains = [];
  allowedDomains = [];
  blockedSubnets = [];

  const activeRules = rules.filter((rule) => {
    const hasWebsites = rule.resources && rule.resources.websites && rule.resources.websites.length > 0;
    if (!hasWebsites) return false;
    return ruleSync.isRuleActive(rule);
  });

  logger.info(`Found ${activeRules.length} active rules with websites`);

  if (activeRules.length === 0) return;

  activeRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const resourceRules = new Map();

  for (const rule of activeRules) {
    for (const website of rule.resources.websites) {
      const domain = extractDomain(website);
      if (!domain) continue;

      if (!resourceRules.has(domain)) {
        resourceRules.set(domain, []);
      }
      resourceRules.get(domain).push(rule);
    }
  }

  for (const [domain, rulesForDomain] of resourceRules) {
    const topPriorityRule = rulesForDomain[0];

    if (topPriorityRule.type === "block") {
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/.test(domain)) {
        blockedSubnets.push(domain);
      } else {
        blockedDomains.push(domain);
      }
    } else if (topPriorityRule.type === "allow") {
      allowedDomains.push(domain);
    }
  }

  logger.info(`Blocked domains: ${blockedDomains.join(", ") || "none"}`);
  logger.info(`Blocked subnets: ${blockedSubnets.join(", ") || "none"}`);
};

// Управление активностями
const addActivity = (activity) => {
  if (!activity || typeof activity !== "object") return;

  recentActivities.unshift(activity);

  if (recentActivities.length > MAX_ACTIVITIES) {
    recentActivities = recentActivities.slice(0, MAX_ACTIVITIES);
  }
};

const getRecentActivities = () => {
  return [...recentActivities];
};

const isDomainBlocked = (domain) => {
  if (!domain) return false;
  
  const cleanDomain = domain.replace(/^www\./, '').toLowerCase();
  
  return blockedDomains.some(blocked => {
    const cleanBlocked = blocked.replace(/^www\./, '').toLowerCase();
    return cleanDomain === cleanBlocked || 
           cleanDomain.endsWith('.' + cleanBlocked) ||
           cleanBlocked.endsWith('.' + cleanDomain);
  });
};

// Обновление hosts файла
const updateHostsFile = async () => {
  return new Promise(async (resolve, reject) => {
    if (hostsFileUpdateLock) {
      logger.info("Hosts file update in progress");
      resolve(true);
      return;
    }

    hostsFileUpdateLock = true;

    try {
      const hostsPath = getHostsPath();
      const updateId = Date.now();
      
      logger.info(`Updating hosts file: ${blockedDomains.length} domains, ${blockedSubnets.length} subnets`);

      let newHostsContent = originalHostsContent;

      const beginMarker = "# BEGIN ACCESS CONTROL AGENT BLOCK";
      const endMarker = "# END ACCESS CONTROL AGENT BLOCK";

      const beginIndex = newHostsContent.indexOf(beginMarker);
      const endIndex = newHostsContent.indexOf(endMarker);

      if (beginIndex !== -1 && endIndex !== -1) {
        newHostsContent =
          newHostsContent.substring(0, beginIndex) +
          newHostsContent.substring(endIndex + endMarker.length);
      }

      let blockContent = `${beginMarker}\n`;
      blockContent += `# Generated at: ${new Date().toISOString()}\n`;
      blockContent += `# User: ${currentUser ? `${currentUser.firstName} ${currentUser.lastName} (${currentUser.email})` : 'Unknown'}\n`;
      blockContent += `# Update ID: ${updateId}\n`;

      for (const domain of blockedDomains) {
        if (domain && domain.trim()) {
          blockContent += `127.0.0.1 ${domain}\n`;
          blockContent += `127.0.0.1 www.${domain}\n`;
          blockContent += `127.0.0.1 m.${domain}\n`;
          blockContent += `127.0.0.1 mobile.${domain}\n`;
        }
      }

      if (blockedSubnets.length > 0) {
        blockContent += `# Subnets blocked via firewall:\n`;
        for (const subnet of blockedSubnets) {
          blockContent += `# ${subnet}\n`;
        }
      }

      blockContent += `${endMarker}\n`;
      newHostsContent += blockContent;

      // Process firewall rules for subnets
      for (const subnet of blockedSubnets) {
        await blockSubnetWithFirewall(subnet);
      }

      fs.writeFileSync(hostsPath, newHostsContent);

      // Verify
      const verificationContent = fs.readFileSync(hostsPath, "utf8");
      const missingDomains = blockedDomains.filter(
        (domain) => !verificationContent.includes(`127.0.0.1 ${domain}`)
      );

      if (missingDomains.length > 0) {
        throw new Error(`Failed to write ${missingDomains.length} domains to hosts file`);
      }

      logger.info(`Hosts file updated successfully`);
      lastKnownBlockedDomains = [...blockedDomains];

      // Clear DNS cache
      await flushDNSCache();

      resolve(true);
    } catch (error) {
      logger.error(`Hosts file update error: ${error.message}`);
      reject(error);
    } finally {
      hostsFileUpdateLock = false;
    }
  });
};

const flushDNSCache = async () => {
  logger.info("Flushing DNS cache");
  
  const commands = [
    "ipconfig /flushdns",
    "netsh interface ip delete arpcache",
    'powershell -Command "Clear-DnsClientCache"'
  ];

  for (const command of commands) {
    try {
      await execCommand(command);
    } catch (error) {
      // Игнорируем ошибки DNS flush
    }
  }

  logger.info("DNS cache flushed");
};

const restoreHostsFileOnly = async () => {
  return new Promise(async (resolve, reject) => {
    try {
      const hostsPath = getHostsPath();
      logger.info("Restoring hosts file");

      fs.writeFileSync(hostsPath, originalHostsContent);

      // Clear firewall rules
      for (const subnet of blockedSubnets) {
        await unblockSubnetWithFirewall(subnet);
      }

      await flushDNSCache();

      logger.info("Hosts file restored");
      resolve(true);
    } catch (error) {
      logger.error(`Hosts file restore error: ${error.message}`);
      reject(error);
    }
  });
};

// Обновление правил
const updateRules = async (newRules, forceUpdate = false) => {
  try {
    logger.info(`Updating rules: ${newRules.length} rules received`);

    rules = newRules || [];
    updateBlockedAndAllowedDomains();

    const domainsChanged = 
      blockedDomains.length !== lastKnownBlockedDomains.length ||
      !blockedDomains.every(domain => lastKnownBlockedDomains.includes(domain));

    if (!_isRunning) {
      logger.info("Starting monitor with new rules");
      await start();
      return true;
    }

    if (!domainsChanged && !forceUpdate) {
      logger.info("No domain changes, continuing monitoring");
      return true;
    }

    logger.info("Domain changes detected, updating hosts file");
    await updateHostsFile();

    return true;
  } catch (error) {
    logger.error(`Rule update error: ${error.message}`);
    return false;
  }
};

// Основные функции запуска/остановки
const start = async () => {
  if (_isRunning) {
    logger.warn('Network monitoring already running');
    return;
  }

  try {
    _isRunning = true;
    logger.info('Starting network monitoring');

    await updateHostsFile();
    await createHTTPServer();
    startRealTimeNetworkMonitoring();
    
    logger.info('Network monitoring started successfully');
  } catch (error) {
    logger.error(`Failed to start monitoring: ${error.message}`);
    _isRunning = false;
    throw error;
  }
};

const stop = () => {
  return new Promise(async (resolve, reject) => {
    if (!_isRunning) {
      logger.info("Network monitoring not running");
      resolve(true);
      return;
    }

    try {
      if (dnsMonitoringInterval) {
        clearInterval(dnsMonitoringInterval);
        dnsMonitoringInterval = null;
      }

      if (monitoringServer) {
        monitoringServer.close();
        monitoringServer = null;
        logger.info('HTTP server stopped');
      }

      await restoreHostsFileOnly();

      _isRunning = false;
      logger.info("Network monitoring stopped");
      resolve(true);
    } catch (error) {
      logger.error(`Stop error: ${error.message}`);
      _isRunning = false;
      reject(error);
    }
  });
};

const isRunning = () => _isRunning;
const getCurrentlyBlockedDomains = () => [...blockedDomains];
const getCurrentlyBlockedSubnets = () => [...blockedSubnets];

module.exports = {
  init,
  start,
  stop,
  updateRules,
  addActivity,
  getRecentActivities,
  isRunning,
  isDomainBlocked,
  getCurrentlyBlockedDomains,
  getCurrentlyBlockedSubnets,
  getHostsPath
};
