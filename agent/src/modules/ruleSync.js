// Enhanced Rule Synchronization Module (ruleSync.js)
const axios = require("axios");
const logger = require("../main/logger");

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

// Force no-cache flag to ensure fresh rules
const FORCE_NO_CACHE = true;

// If the app object is not available directly, we need a different approach
const saveRulesToDisk = (rules, userId) => {
  try {
    // Get the app data path in a safer way that doesn't rely on app object
    let appDataPath;

    try {
      // Try to get app from electron in case we're in the main process
      const { app } = require("electron");
      appDataPath = app.getPath("userData");
    } catch (electronError) {
      // If we're in a renderer process or can't access app directly
      // Use environment variables to locate AppData
      if (process.platform === "win32") {
        appDataPath = path.join(process.env.APPDATA, "access-control-agent");
      } else if (process.platform === "darwin") {
        appDataPath = path.join(
          process.env.HOME,
          "Library",
          "Application Support",
          "access-control-agent"
        );
      } else {
        appDataPath = path.join(
          process.env.HOME,
          ".config",
          "access-control-agent"
        );
      }
    }

    // Create rules directory
    const rulesPath = path.join(appDataPath, "rules");

    // Check if the directory exists, create it if not
    if (!fs.existsSync(rulesPath)) {
      fs.mkdirSync(rulesPath, { recursive: true });
    }

    // Save rules with timestamp
    const timestamp = new Date().getTime();
    const filePath = path.join(rulesPath, `rules_${userId}_${timestamp}.json`);

    // Log the absolute path for debugging
    logger.info(`Saving rules to: ${filePath}`);

    // Write new rules
    fs.writeFileSync(filePath, JSON.stringify(rules, null, 2));

    // Clean up old rules files - only keep the 2 most recent versions
    try {
      const files = fs.readdirSync(rulesPath);

      // Find user's rule files and sort by timestamp (newest first)
      const userFiles = files
        .filter((file) => file.startsWith(`rules_${userId}_`))
        .sort((a, b) => {
          const timestampA = parseInt(a.split("_")[2].split(".")[0]);
          const timestampB = parseInt(b.split("_")[2].split(".")[0]);
          return timestampB - timestampA; // Descending order
        });

      // Keep the 2 most recent files, delete the rest
      if (userFiles.length > 2) {
        for (let i = 2; i < userFiles.length; i++) {
          const oldFilePath = path.join(rulesPath, userFiles[i]);
          logger.info(`Removing old rules file: ${userFiles[i]}`);
          fs.unlinkSync(oldFilePath);
        }
      }
    } catch (cleanupError) {
      logger.warn(`Failed to clean up old rule files: ${cleanupError.message}`);
      // Continue anyway, not critical
    }

    logger.info(`Rules successfully saved to disk with timestamp ${timestamp}`);
    return true;
  } catch (error) {
    logger.error(`Error saving rules to disk: ${error.message}`);
    return false;
  }
};

// Helper for finding user rules by handling different ID formats
const isUserIdMatch = (ruleUser, userId) => {
  // If userId is an email, special comparison is needed
  const isEmail = userId && userId.includes("@");

  // Handle string comparison
  if (typeof ruleUser === "string") {
    if (isEmail && ruleUser.includes("@")) {
      return ruleUser === userId;
    }
    return ruleUser === userId;
  }
  // Handle object comparison
  else if (typeof ruleUser === "object") {
    if (ruleUser === null) return false;

    // Handle MongoDB ObjectId references
    if (ruleUser._id) return ruleUser._id === userId;
    if (ruleUser.$oid) return ruleUser.$oid === userId;

    // Handle objects with email property
    if (isEmail && ruleUser.email) return ruleUser.email === userId;

    // Try to find userId in the stringified object
    const objStr = JSON.stringify(ruleUser);
    return objStr.includes(userId);
  }

  return false;
};

const fullForceUpdate = async (userId, token, apiUrl) => {
  try {
    // 1. Остановка всех мониторов
    await networkMonitor.stop();
    await processMonitor.stop();

    // 2. Очистка всех кэшей
    clearAgentCache();

    // 3. Принудительное получение новых правил с сервера
    const rules = await getRules(userId, token, apiUrl, true);

    // 4. Перезапуск мониторов с новыми правилами
    await networkMonitor.init(rules, currentUser);
    await processMonitor.init(rules, currentUser);

    networkMonitor.start();
    processMonitor.start();

    return { success: true, rules };
  } catch (error) {
    logger.error(`Full force update failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const thoroughDNSFlush = async () => {
  logger.info("Performing thorough DNS cache flush");

  // Выполняем несколько команд для более надежной очистки DNS
  const commands = [];

  if (process.platform === "win32") {
    commands.push(
      "ipconfig /flushdns",
      "netsh interface ip delete arpcache",
      'powershell -Command "Clear-DnsClientCache"'
    );
  } else if (process.platform === "darwin") {
    commands.push(
      "dscacheutil -flushcache",
      "killall -HUP mDNSResponder",
      "killall mDNSResponderHelper"
    );
  } else {
    commands.push(
      "systemd-resolve --flush-caches",
      "service nscd restart",
      "resolvectl flush-caches"
    );
  }

  for (const command of commands) {
    try {
      await executeCommand(command);
      logger.info(`Executed DNS flush command: ${command}`);
    } catch (err) {
      logger.warn(`Command failed: ${command} - ${err.message}`);
    }
  }
};

const executeCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
};

const rulesStore = {
  byId: {}, // Правила по ID
  byType: {
    // Правила по типу
    allow: {},
    block: {},
  },
  byResource: {
    // Правила по ресурсам
    websites: {},
    applications: {},
  },
  byUser: {}, // Правила по пользователям
  byDepartment: {}, // Правила по отделам
  byRole: {}, // Правила по ролям
  lastSync: 0, // Время последней синхронизации
  syncStatus: "none", // Статус синхронизации: 'none', 'success', 'error'
  syncError: null, // Ошибка синхронизации
  userId: null, // ID пользователя, для которого хранятся правила
};

// Обновленная функция getRules
const getRules = async (
  userId,
  token,
  apiUrl,
  forceNoCache = FORCE_NO_CACHE
) => {
  try {
    // Устанавливаем ID пользователя в хранилище
    rulesStore.userId = userId;

    logger.info(
      `Fetching access rules for user ${userId}${
        forceNoCache ? " (with cache busting)" : ""
      }`
    );

    // Добавляем timestamp для избежания кэширования
    const timestamp = new Date().getTime();
    const noCacheParam = forceNoCache ? `?nocache=${timestamp}` : "";

    // Определяем заголовки с директивами контроля кэширования
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // Добавляем заголовки контроля кэша, если запрошено
    if (forceNoCache) {
      headers["Cache-Control"] =
        "no-cache, no-store, must-revalidate, max-age=0";
      headers["Pragma"] = "no-cache";
      headers["Expires"] = "0";
      headers["X-Force-Update"] = "true";
    }

    try {
      // Используем axios напрямую для лучшего контроля кэширования
      const response = await axios.get(
        `${apiUrl}/agent/rules/user/${userId}${noCacheParam}`,
        {
          headers: headers,
          timeout: 10000, // Добавляем таймаут для предотвращения зависания
        }
      );

      if (response.data) {
        const rules = response.data;
        logger.info(
          `Received ${rules.length} fresh access rules for user ${userId}`
        );

        // Добавляем версионность к правилам
        const versionedRules = rules.map((rule) => ({
          ...rule,
          __version: timestamp,
        }));

        // Обновляем хранилище правил
        updateRulesStore(versionedRules);

        // Пытаемся сохранить правила на диск, но обрабатываем ошибки
        try {
          saveRulesToDisk(versionedRules, userId);
          saveFallbackCopy(versionedRules, userId); // Дополнительное резервное копирование
        } catch (diskError) {
          logger.error(`Error saving rules to disk: ${diskError.message}`);
          // Продолжаем в любом случае, не критично
        }

        // Обрабатываем правила как обычно
        const normalizedRules = versionedRules.map((rule) =>
          normalizeRuleStructure(rule, userId)
        );

        return normalizedRules;
      } else {
        logger.error("API returned empty or null response");
        throw new Error("Invalid response from Agent API");
      }
    } catch (apiError) {
      // Логируем подробности об ошибке API
      if (apiError.response) {
        logger.error(`API error status: ${apiError.response.status}`);
        logger.error(
          `API error data: ${JSON.stringify(apiError.response.data || {})}`
        );
      } else if (apiError.request) {
        logger.error(`No response received from API. Request timeout?`);
      } else {
        logger.error(`API request setup error: ${apiError.message}`);
      }

      logger.warn(
        `Error getting rules from Agent API: ${apiError.message}, trying fallback sources`
      );

      // Пробуем загрузить правила из хранилища, если оно актуально
      if (
        rulesStore.lastSync > 0 &&
        Date.now() - rulesStore.lastSync < 3600000
      ) {
        // 1 час
        logger.info(`Using rules from memory store as first fallback`);
        const cachedRules = getRulesArray();
        if (cachedRules.length > 0) {
          return cachedRules;
        }
      }

      // Пробуем загрузить с диска
      try {
        const diskRules = loadRulesFromDisk(userId);
        if (diskRules && diskRules.length > 0) {
          logger.info(
            `Loaded ${diskRules.length} rules from disk cache as fallback`
          );
          // Обновляем хранилище
          updateRulesStore(diskRules);
          return diskRules;
        }
      } catch (diskError) {
        logger.error(`Failed to load rules from disk: ${diskError.message}`);
      }

      // Пробуем MongoDB напрямую как последнее средство
      try {
        logger.info("Attempting MongoDB direct connection as last resort");
        // Подключаемся к MongoDB
        const mongoDbDirect = require("./mongoDbDirect");
        const mongoUri = require("../main/main").config.mongoUri;

        const connected = await mongoDbDirect.connect(
          mongoUri,
          "zero_trust_db"
        );
        if (!connected) {
          throw new Error("Failed to connect to MongoDB");
        }

        // Получаем правила для пользователя
        const mongoRules = await mongoDbDirect.getRulesForUser(userId);
        logger.info(
          `Got ${mongoRules.length} rules from MongoDB direct connection`
        );

        // Обновляем хранилище
        updateRulesStore(mongoRules);

        return mongoRules;
      } catch (mongoError) {
        logger.error(`MongoDB direct connection failed: ${mongoError.message}`);
        throw mongoError;
      }
    }
  } catch (error) {
    logger.error(`Error fetching access rules: ${error.message}`);

    // Проверяем хранилище в памяти как последнее средство
    const cachedRules = getRulesArray();
    if (cachedRules.length > 0) {
      logger.warn(
        `Using ${cachedRules.length} rules from memory cache as emergency fallback`
      );
      return cachedRules;
    }

    // Возвращаем правила по умолчанию как запасной вариант, когда все остальное не сработало
    logger.warn("Returning default emergency fallback rules");
    return getDefaultRules();
  }
};

// Функция обновления хранилища правил
const updateRulesStore = (rules) => {
  // Очищаем предыдущие данные
  rulesStore.byId = {};
  rulesStore.byType = { allow: {}, block: {} };
  rulesStore.byResource = { websites: {}, applications: {} };
  rulesStore.byUser = {};
  rulesStore.byDepartment = {};
  rulesStore.byRole = {};

  // Обновляем хранилище правил
  for (const rule of rules) {
    if (!rule || (!rule._id && !rule.id)) continue;

    const ruleId = rule._id || rule.id;

    // Сохраняем в byId
    rulesStore.byId[ruleId] = rule;

    // Сохраняем по типу
    if (rule.type) {
      rulesStore.byType[rule.type][ruleId] = rule;
    }

    // Сохраняем по ресурсам
    if (rule.resources) {
      // Обрабатываем веб-сайты
      if (rule.resources.websites && Array.isArray(rule.resources.websites)) {
        for (const website of rule.resources.websites) {
          if (!rulesStore.byResource.websites[website]) {
            rulesStore.byResource.websites[website] = [];
          }
          rulesStore.byResource.websites[website].push(ruleId);
        }
      }

      // Обрабатываем приложения
      if (
        rule.resources.applications &&
        Array.isArray(rule.resources.applications)
      ) {
        for (const app of rule.resources.applications) {
          if (!rulesStore.byResource.applications[app]) {
            rulesStore.byResource.applications[app] = [];
          }
          rulesStore.byResource.applications[app].push(ruleId);
        }
      }
    }

    // Сохраняем по пользователям, отделам и ролям
    if (rule.appliesTo) {
      // Пользователи
      if (rule.appliesTo.users && Array.isArray(rule.appliesTo.users)) {
        for (const user of rule.appliesTo.users) {
          const userId = typeof user === "object" ? user._id || user.id : user;
          if (!userId) continue;

          if (!rulesStore.byUser[userId]) {
            rulesStore.byUser[userId] = [];
          }
          rulesStore.byUser[userId].push(ruleId);
        }
      }

      // Отделы
      if (
        rule.appliesTo.departments &&
        Array.isArray(rule.appliesTo.departments)
      ) {
        for (const dept of rule.appliesTo.departments) {
          if (!rulesStore.byDepartment[dept]) {
            rulesStore.byDepartment[dept] = [];
          }
          rulesStore.byDepartment[dept].push(ruleId);
        }
      }

      // Роли
      if (rule.appliesTo.roles && Array.isArray(rule.appliesTo.roles)) {
        for (const role of rule.appliesTo.roles) {
          if (!rulesStore.byRole[role]) {
            rulesStore.byRole[role] = [];
          }
          rulesStore.byRole[role].push(ruleId);
        }
      }
    }
  }

  // Обновляем метаданные
  rulesStore.lastSync = Date.now();
  rulesStore.syncStatus = "success";
  rulesStore.syncError = null;

  logger.info(
    `Rules store updated with ${rules.length} rules, timestamp: ${rulesStore.lastSync}`
  );

  // Возвращаем количество обработанных правил
  return rules.length;
};

// Функция получения массива правил из хранилища
const getRulesArray = () => {
  return Object.values(rulesStore.byId);
};

// Быстрый поиск правил по различным критериям
const findRules = (criteria) => {
  const foundRuleIds = new Set();

  // Поиск по типу
  if (criteria.type && rulesStore.byType[criteria.type]) {
    Object.keys(rulesStore.byType[criteria.type]).forEach((id) =>
      foundRuleIds.add(id)
    );
  }

  // Поиск по веб-сайтам
  if (criteria.website) {
    const pattern = extractDomain(criteria.website);
    Object.keys(rulesStore.byResource.websites).forEach((website) => {
      if (website.includes(pattern) || pattern.includes(website)) {
        rulesStore.byResource.websites[website].forEach((id) =>
          foundRuleIds.add(id)
        );
      }
    });
  }

  // Поиск по приложениям
  if (criteria.application) {
    Object.keys(rulesStore.byResource.applications).forEach((app) => {
      if (
        app.includes(criteria.application) ||
        criteria.application.includes(app)
      ) {
        rulesStore.byResource.applications[app].forEach((id) =>
          foundRuleIds.add(id)
        );
      }
    });
  }

  // Поиск по пользователю
  if (criteria.userId && rulesStore.byUser[criteria.userId]) {
    rulesStore.byUser[criteria.userId].forEach((id) => foundRuleIds.add(id));
  }

  // Поиск по отделу
  if (criteria.department && rulesStore.byDepartment[criteria.department]) {
    rulesStore.byDepartment[criteria.department].forEach((id) =>
      foundRuleIds.add(id)
    );
  }

  // Поиск по роли
  if (criteria.role && rulesStore.byRole[criteria.role]) {
    rulesStore.byRole[criteria.role].forEach((id) => foundRuleIds.add(id));
  }

  // Преобразуем набор ID в массив правил
  return Array.from(foundRuleIds)
    .map((id) => rulesStore.byId[id])
    .filter((rule) => rule);
};

// Получение правил блокировки для конкретного домена
const findBlockRulesForDomain = (domain) => {
  if (!domain) return [];

  const normalizedDomain = extractDomain(domain);
  const rules = [];

  // Ищем в byResource.websites
  Object.keys(rulesStore.byResource.websites).forEach((website) => {
    const websiteDomain = extractDomain(website);

    if (
      normalizedDomain.includes(websiteDomain) ||
      websiteDomain.includes(normalizedDomain)
    ) {
      // Получаем ID правил для этого веб-сайта
      const ruleIds = rulesStore.byResource.websites[website];

      // Находим правила блокировки
      ruleIds.forEach((id) => {
        const rule = rulesStore.byId[id];
        if (rule && rule.type === "block" && rule.isActive) {
          rules.push(rule);
        }
      });
    }
  });

  // Сортируем по приоритету
  return rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
};

// Получение правил разрешения для конкретного домена
const findAllowRulesForDomain = (domain) => {
  if (!domain) return [];

  const normalizedDomain = extractDomain(domain);
  const rules = [];

  // Ищем в byResource.websites
  Object.keys(rulesStore.byResource.websites).forEach((website) => {
    const websiteDomain = extractDomain(website);

    if (
      normalizedDomain.includes(websiteDomain) ||
      websiteDomain.includes(normalizedDomain)
    ) {
      // Получаем ID правил для этого веб-сайта
      const ruleIds = rulesStore.byResource.websites[website];

      // Находим правила разрешения
      ruleIds.forEach((id) => {
        const rule = rulesStore.byId[id];
        if (rule && rule.type === "allow" && rule.isActive) {
          rules.push(rule);
        }
      });
    }
  });

  // Сортируем по приоритету
  return rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
};

// Функция проверки, заблокирован ли домен
const isDomainBlocked = (domain) => {
  if (!domain) return false;

  const normalizedDomain = extractDomain(domain);
  
  // 1. СОБИРАЕМ ВСЕ ПРАВИЛА (allow + block) для домена
  const allRelevantRules = [];

  // Ищем в byResource.websites
  Object.keys(rulesStore.byResource.websites).forEach((website) => {
    const websiteDomain = extractDomain(website);

    if (
      normalizedDomain.includes(websiteDomain) ||
      websiteDomain.includes(normalizedDomain)
    ) {
      // Получаем ID правил для этого веб-сайта
      const ruleIds = rulesStore.byResource.websites[website];

      // Находим ВСЕ активные правила (и allow, и block)
      ruleIds.forEach((id) => {
        const rule = rulesStore.byId[id];
        if (rule && rule.isActive && (rule.type === "allow" || rule.type === "block")) {
          // Проверяем временные ограничения
          if (isRuleActive(rule)) {
            allRelevantRules.push(rule);
          }
        }
      });
    }
  });

  // 2. СОРТИРУЕМ ПО ПРИОРИТЕТУ (больше = выше приоритет)
  allRelevantRules.sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    return priorityB - priorityA; // Убывающий порядок
  });

  // 3. ПРИМЕНЯЕМ ПЕРВОЕ ПРАВИЛО С НАИВЫСШИМ ПРИОРИТЕТОМ
  if (allRelevantRules.length === 0) {
    logger.debug(`No rules found for domain ${domain}, allowing by default`);
    return false; // По умолчанию разрешаем
  }

  const topPriorityRule = allRelevantRules[0];
  const isBlocked = topPriorityRule.type === "block";

  // Детальное логирование для отладки
  logger.info(
    `Domain ${domain} ${isBlocked ? "BLOCKED" : "ALLOWED"} by rule "${topPriorityRule.name}" ` +
    `(type: ${topPriorityRule.type}, priority: ${topPriorityRule.priority || 0})`
  );

  // Если есть конфликтующие правила, логируем их
  if (allRelevantRules.length > 1) {
    const conflictingRules = allRelevantRules.slice(1, 3); // Показываем следующие 2 правила
    logger.debug(
      `Conflicting rules for ${domain}: ` +
      conflictingRules.map(r => 
        `"${r.name}" (${r.type}, priority: ${r.priority || 0})`
      ).join(", ")
    );
  }

  return isBlocked;
};

// Функция для получения статуса синхронизации правил
const getRulesSyncStatus = () => {
  return {
    lastSync: rulesStore.lastSync,
    status: rulesStore.syncStatus,
    error: rulesStore.syncError,
    ruleCount: Object.keys(rulesStore.byId).length,
    userId: rulesStore.userId,
  };
};

// Функция для быстрой проверки, существуют ли правила для определенного ресурса
const hasRulesForResource = (resourceType, resourceValue) => {
  if (!resourceType || !resourceValue) return false;

  if (resourceType === "website" || resourceType === "websites") {
    const domain = extractDomain(resourceValue);

    // Быстрая проверка для точного совпадения
    if (rulesStore.byResource.websites[domain]) return true;

    // Проверка для частичного совпадения
    return Object.keys(rulesStore.byResource.websites).some(
      (website) => domain.includes(website) || website.includes(domain)
    );
  }

  if (resourceType === "application" || resourceType === "applications") {
    // Быстрая проверка для точного совпадения
    if (rulesStore.byResource.applications[resourceValue]) return true;

    // Проверка для частичного совпадения
    return Object.keys(rulesStore.byResource.applications).some(
      (app) => resourceValue.includes(app) || app.includes(resourceValue)
    );
  }

  return false;
};

// Функция для обработки изменений правил, выявления различий
const processDifferencesBetweenRuleSets = (oldRules, newRules) => {
  if (!oldRules || !newRules) return null;

  // Преобразуем массивы в объекты для быстрого доступа по ID
  const oldRulesMap = {};
  const newRulesMap = {};

  oldRules.forEach((rule) => {
    const id = rule._id || rule.id;
    if (id) oldRulesMap[id] = rule;
  });

  newRules.forEach((rule) => {
    const id = rule._id || rule.id;
    if (id) newRulesMap[id] = rule;
  });

  // Находим добавленные, удаленные и измененные правила
  const added = [];
  const removed = [];
  const modified = [];

  // Находим новые и измененные правила
  Object.keys(newRulesMap).forEach((id) => {
    if (!oldRulesMap[id]) {
      added.push(newRulesMap[id]);
    } else {
      // Проверяем изменения в правиле, игнорируя служебные поля
      const oldRule = oldRulesMap[id];
      const newRule = newRulesMap[id];

      // Сравниваем только важные поля
      if (
        oldRule.type !== newRule.type ||
        oldRule.isActive !== newRule.isActive ||
        oldRule.priority !== newRule.priority ||
        JSON.stringify(oldRule.resources) !==
          JSON.stringify(newRule.resources) ||
        JSON.stringify(oldRule.appliesTo) !==
          JSON.stringify(newRule.appliesTo) ||
        JSON.stringify(oldRule.conditions) !==
          JSON.stringify(newRule.conditions)
      ) {
        modified.push({
          old: oldRule,
          new: newRule,
          changes: detectChanges(oldRule, newRule),
        });
      }
    }
  });

  // Находим удаленные правила
  Object.keys(oldRulesMap).forEach((id) => {
    if (!newRulesMap[id]) {
      removed.push(oldRulesMap[id]);
    }
  });

  // Возвращаем результат анализа
  return {
    added,
    removed,
    modified,
    summary: {
      total: Object.keys(newRulesMap).length,
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      unchanged:
        Object.keys(newRulesMap).length - added.length - modified.length,
    },
  };
};

// Вспомогательная функция для выявления конкретных изменений в правиле
const detectChanges = (oldRule, newRule) => {
  const changes = {};

  // Проверяем изменения в основных полях
  if (oldRule.type !== newRule.type) {
    changes.type = { old: oldRule.type, new: newRule.type };
  }

  if (oldRule.isActive !== newRule.isActive) {
    changes.isActive = { old: oldRule.isActive, new: newRule.isActive };
  }

  if (oldRule.priority !== newRule.priority) {
    changes.priority = { old: oldRule.priority, new: newRule.priority };
  }

  // Проверяем изменения в ресурсах
  if (oldRule.resources && newRule.resources) {
    changes.resources = {};

    // Сравниваем веб-сайты
    if (
      JSON.stringify(oldRule.resources.websites) !==
      JSON.stringify(newRule.resources.websites)
    ) {
      // Находим добавленные и удаленные веб-сайты
      const oldWebsites = new Set(oldRule.resources.websites || []);
      const newWebsites = new Set(newRule.resources.websites || []);

      const addedWebsites = [...newWebsites].filter(
        (site) => !oldWebsites.has(site)
      );
      const removedWebsites = [...oldWebsites].filter(
        (site) => !newWebsites.has(site)
      );

      changes.resources.websites = {
        added: addedWebsites,
        removed: removedWebsites,
      };
    }

    // Сравниваем приложения
    if (
      JSON.stringify(oldRule.resources.applications) !==
      JSON.stringify(newRule.resources.applications)
    ) {
      // Находим добавленные и удаленные приложения
      const oldApps = new Set(oldRule.resources.applications || []);
      const newApps = new Set(newRule.resources.applications || []);

      const addedApps = [...newApps].filter((app) => !oldApps.has(app));
      const removedApps = [...oldApps].filter((app) => !newApps.has(app));

      changes.resources.applications = {
        added: addedApps,
        removed: removedApps,
      };
    }
  }

  // Проверяем изменения в appliesTo
  if (oldRule.appliesTo && newRule.appliesTo) {
    changes.appliesTo = {};

    // Сравниваем пользователей
    if (
      JSON.stringify(oldRule.appliesTo.users) !==
      JSON.stringify(newRule.appliesTo.users)
    ) {
      changes.appliesTo.users = {
        old: oldRule.appliesTo.users,
        new: newRule.appliesTo.users,
      };
    }

    // Сравниваем отделы
    if (
      JSON.stringify(oldRule.appliesTo.departments) !==
      JSON.stringify(newRule.appliesTo.departments)
    ) {
      changes.appliesTo.departments = {
        old: oldRule.appliesTo.departments,
        new: newRule.appliesTo.departments,
      };
    }

    // Сравниваем роли
    if (
      JSON.stringify(oldRule.appliesTo.roles) !==
      JSON.stringify(newRule.appliesTo.roles)
    ) {
      changes.appliesTo.roles = {
        old: oldRule.appliesTo.roles,
        new: newRule.appliesTo.roles,
      };
    }
  }

  // Проверяем изменения во временных ограничениях
  if (
    oldRule.conditions?.timeRestrictions ||
    newRule.conditions?.timeRestrictions
  ) {
    const oldTimeRestrictions = oldRule.conditions?.timeRestrictions || {};
    const newTimeRestrictions = newRule.conditions?.timeRestrictions || {};

    if (
      JSON.stringify(oldTimeRestrictions) !==
      JSON.stringify(newTimeRestrictions)
    ) {
      changes.timeRestrictions = {
        old: oldTimeRestrictions,
        new: newTimeRestrictions,
      };
    }
  }

  return changes;
};

// Дополнительное резервное копирование
const saveFallbackCopy = (rules, userId) => {
  try {
    const tempDir = os.tmpdir();
    const fallbackPath = path.join(tempDir, `agent_rules_${userId}.json`);
    fs.writeFileSync(fallbackPath, JSON.stringify(rules, null, 2));
    logger.debug(`Saved fallback rules copy to: ${fallbackPath}`);
  } catch (error) {
    logger.warn(`Failed to save fallback copy: ${error.message}`);
  }
};

// Improved function to load rules from disk with better error handling and logging
const loadRulesFromDisk = (userId) => {
  try {
    // Get the app data path in a safer way
    let appDataPath;

    try {
      // Try to get app from electron in case we're in the main process
      const { app } = require("electron");
      appDataPath = app.getPath("userData");
    } catch (electronError) {
      // If we're in a renderer process or can't access app directly
      // Use environment variables to locate AppData
      if (process.platform === "win32") {
        appDataPath = path.join(process.env.APPDATA, "access-control-agent");
      } else if (process.platform === "darwin") {
        appDataPath = path.join(
          process.env.HOME,
          "Library",
          "Application Support",
          "access-control-agent"
        );
      } else {
        appDataPath = path.join(
          process.env.HOME,
          ".config",
          "access-control-agent"
        );
      }
    }

    // Path to rules directory
    const rulesPath = path.join(appDataPath, "rules");

    if (!fs.existsSync(rulesPath)) {
      logger.warn(`Rules directory does not exist: ${rulesPath}`);
      return null;
    }

    // Find newest rule file for this user
    const files = fs
      .readdirSync(rulesPath)
      .filter((file) => file.startsWith(`rules_${userId}_`))
      .sort() // Sort to get latest file (timestamps are in filename)
      .reverse();

    if (files.length === 0) {
      logger.warn(`No cached rules found for user ${userId}`);
      return null;
    }

    // Read the latest file
    const latestFile = path.join(rulesPath, files[0]);
    logger.info(`Loading rules from cache file: ${latestFile}`);

    const content = fs.readFileSync(latestFile, "utf8");
    const rules = JSON.parse(content);

    // Log file size and rule count for debugging
    logger.info(
      `Loaded ${rules.length} rules from cache file (${content.length} bytes)`
    );

    // Process rules as normal
    const normalizedRules = rules.map((rule) =>
      normalizeRuleStructure(rule, userId)
    );

    return normalizedRules;
  } catch (error) {
    logger.error(`Error loading rules from disk: ${error.message}`);
    return null;
  }
};

// Helper function to normalize rule structure
const normalizeRuleStructure = (rule, userId) => {
  // Create a deep copy to avoid modifying the original
  const normalizedRule = JSON.parse(JSON.stringify(rule));

  // Log the raw rule structure for debugging
  logger.debug(
    `Normalizing rule: ${JSON.stringify(rule).substring(0, 200)}...`
  );

  // Make sure ID uses consistent format (_id to id if needed)
  if (rule._id && !rule.id) {
    normalizedRule.id = rule._id;
  }

  // Check if this rule is directly assigned to the user
  if (
    rule.appliesTo &&
    rule.appliesTo.users &&
    Array.isArray(rule.appliesTo.users)
  ) {
    normalizedRule.__userSpecific = rule.appliesTo.users.some((ruleUser) =>
      isUserIdMatch(ruleUser, userId)
    );

    if (normalizedRule.__userSpecific) {
      logger.info(
        `Rule "${rule.name}" (${rule.type}) is directly assigned to user ${userId}`
      );
    }
  }

  // Ensure consistent structure for resources
  if (!normalizedRule.resources) {
    normalizedRule.resources = {};
  }
  if (!Array.isArray(normalizedRule.resources.websites)) {
    normalizedRule.resources.websites = [];
  }
  if (!Array.isArray(normalizedRule.resources.applications)) {
    normalizedRule.resources.applications = [];
  }
  if (!Array.isArray(normalizedRule.resources.files)) {
    normalizedRule.resources.files = [];
  }

  // Add a friendly ruleName to use in the activity logs
  normalizedRule.ruleName = `${normalizedRule.name} ${
    normalizedRule.__userSpecific ? "(Personal Rule)" : ""
  }`;

  return normalizedRule;
};

// Default fallback rules to use when server communication fails
const getDefaultRules = () => {
  logger.warn("Using fallback default rules - minimal protection enabled");
  return [
    {
      name: "Emergency Fallback Rule - Allow Essential",
      description: "Default allow rule used when server is unavailable",
      type: "allow",
      resources: {
        websites: ["google.com", "microsoft.com", "office.com", "bing.com"],
        applications: [
          "chrome.exe",
          "msedge.exe",
          "firefox.exe",
          "outlook.exe",
          "winword.exe",
          "excel.exe",
        ],
        files: [],
      },
      priority: 100,
      isActive: true,
      ruleName: "Emergency Fallback Rule - Allow Essential",
    },
    {
      name: "Emergency Fallback Rule - Block Social Media",
      description: "Default block rule used when server is unavailable",
      type: "block",
      resources: {
        websites: [
          "facebook.com",
          "twitter.com",
          "instagram.com",
          "tiktok.com",
        ],
        applications: [],
        files: [],
      },
      priority: 50,
      isActive: true,
      ruleName: "Emergency Fallback Rule - Block Social Media",
    },
  ];
};

// Send activity logs to server
const sendActivityLogs = async (logsData, token, apiUrl) => {
  try {
    logger.info(`Sending ${logsData.length} activity logs to server`);

    // Try using the Agent API endpoint first
    try {
      // Add some debugging for the first few log items
      if (logsData.length > 0) {
        logger.debug(`Sample log item: ${JSON.stringify(logsData[0])}`);
      }

      // Make the API request with proper headers
      const response = await axios.post(
        `${apiUrl}/agent/logs/batch`,
        { logs: logsData },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache", // Add cache control header
          },
          // Add increased timeout to accommodate larger payloads
          timeout: 30000, // 30 seconds
        }
      );

      if (response.data && response.data.success) {
        logger.info(
          `Successfully sent ${logsData.length} activity logs to server via Agent API`
        );
        return {
          success: true,
          count: logsData.length,
        };
      } else {
        logger.warn(
          `Unexpected API response: ${JSON.stringify(response.data)}`
        );
        throw new Error("Invalid response from Agent API");
      }
    } catch (apiError) {
      // Better error logging
      if (apiError.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        logger.error(`API error status: ${apiError.response.status}`);
        logger.error(
          `API error data: ${JSON.stringify(apiError.response.data || {})}`
        );
      } else if (apiError.request) {
        // The request was made but no response was received
        logger.error(`No response received from API. Request timeout?`);
      } else {
        // Something happened in setting up the request that triggered an Error
        logger.error(`API request setup error: ${apiError.message}`);
      }

      logger.warn(
        `Error sending logs to Agent API: ${apiError.message}, trying MongoDB direct connection`
      );

      // Connect to MongoDB
      const mongoUri = require("../main/main").config.mongoUri;
      const mongoDbDirect = require("./mongoDbDirect");
      const connected = await mongoDbDirect.connect(mongoUri, "zero_trust_db");

      if (!connected) {
        throw new Error("Failed to connect to MongoDB");
      }

      // Get the user ID from the first log
      let userId = null;
      if (logsData.length > 0) {
        userId = logsData[0].userId || logsData[0].user_id;
      }

      // Log activities directly to MongoDB with retry
      let result = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          result = await mongoDbDirect.logActivities(logsData, userId);
          break; // Exit the retry loop if successful
        } catch (mongoError) {
          retryCount++;
          logger.warn(
            `MongoDB logging attempt ${retryCount} failed: ${mongoError.message}`
          );

          if (retryCount >= maxRetries) {
            throw mongoError; // Rethrow if we've exhausted retries
          }

          // Wait between retries with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount)
          );
        }
      }

      if (result && result.success) {
        logger.info(
          `Successfully logged ${result.count} activities directly to MongoDB`
        );
      } else {
        throw new Error(
          `Failed to log activities to MongoDB: ${
            (result && result.error) || "Unknown error"
          }`
        );
      }

      return result;
    }
  } catch (error) {
    logger.error(`Error sending activity logs: ${error.message}`);
    if (error.stack) {
      logger.debug(`Stack trace: ${error.stack}`);
    }
    return {
      success: false,
      error: error.message,
    };
  }
};

// Check if rule is active based on time restrictions with better logging
const isRuleActive = (rule) => {
  // Log the rule basics for debugging
  logger.debug(
    `Checking if rule is active: ${rule.name} (${rule.type}), isActive flag: ${rule.isActive}`
  );

  // If rule is not marked as active, it's inactive
  if (!rule.isActive) {
    logger.debug(`Rule "${rule.name}" is marked as inactive`);
    return false;
  }

  // Check if rule has resources
  if (!rule.resources) {
    logger.debug(`Rule "${rule.name}" has no resources`);
    return false;
  }

  // If time restrictions are not enabled, rule is always active
  if (
    !rule.conditions ||
    !rule.conditions.timeRestrictions ||
    !rule.conditions.timeRestrictions.enabled
  ) {
    return true;
  }

  const timeRestrictions = rule.conditions.timeRestrictions;
  const now = new Date();

  // Check day of week (0 - Sunday, 1 - Monday, ...)
  const currentDay = now.getDay();

  // IMPROVED LOGGING: Log the current day and allowed days for debugging
  if (timeRestrictions.days && timeRestrictions.days.length > 0) {
    logger.debug(
      `Day check for rule "${
        rule.name
      }": Current day is ${currentDay} (${getDayName(currentDay)}), ` +
        `Allowed days are [${timeRestrictions.days
          .map((d) => `${d} (${getDayName(d)})`)
          .join(", ")}]`
    );
  }

  // If day of week is not in the list of allowed days, rule is inactive
  if (
    timeRestrictions.days &&
    timeRestrictions.days.length > 0 &&
    !timeRestrictions.days.includes(currentDay)
  ) {
    logger.debug(
      `Rule "${rule.name}" is not active on day ${currentDay} (${getDayName(
        currentDay
      )})`
    );
    return false;
  }

  // Check time
  if (timeRestrictions.startTime && timeRestrictions.endTime) {
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes

    // Parse start and end time
    const startParts = timeRestrictions.startTime.split(":");
    const endParts = timeRestrictions.endTime.split(":");

    if (startParts.length === 2 && endParts.length === 2) {
      const startTime = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endTime = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

      // IMPROVED LOGGING: Log time check details
      logger.debug(
        `Time check for rule "${rule.name}": Current time is ${formatTime(
          currentTime
        )}, ` +
          `Allowed time range is ${formatTime(startTime)} - ${formatTime(
            endTime
          )}`
      );

      // If current time is not in the interval, rule is inactive
      if (currentTime < startTime || currentTime > endTime) {
        logger.debug(
          `Rule "${rule.name}" is not active at time ${formatTime(currentTime)}`
        );
        return false;
      }
    }
  }

  // If all checks pass, rule is active
  logger.debug(`Rule "${rule.name}" is active`);
  return true;
};

// Helper function to get day name
const getDayName = (dayNumber) => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[dayNumber] || "Unknown";
};

// Helper function to format time in minutes as HH:MM
const formatTime = (timeInMinutes) => {
  const hours = Math.floor(timeInMinutes / 60);
  const minutes = timeInMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
};

const checkTimeRestriction = (rule, now = new Date()) => {
  // If rule has no time restrictions or they're not enabled, rule is always active
  if (
    !rule.conditions ||
    !rule.conditions.timeRestrictions ||
    !rule.conditions.timeRestrictions.enabled
  ) {
    return true;
  }

  const tr = rule.conditions.timeRestrictions;

  // Check day of week
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ...

  // Log detailed day information
  logger.debug(
    `Time restriction check for "${rule.name}": ` +
      `Current day is ${currentDay} (${
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][currentDay]
      }), ` +
      `Allowed days: ${tr.days ? JSON.stringify(tr.days) : "all days"}`
  );

  if (tr.days && tr.days.length > 0 && !tr.days.includes(currentDay)) {
    return false;
  }

  // Check time of day
  if (tr.startTime && tr.endTime) {
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Parse start and end times
    const startParts = tr.startTime.split(":");
    const endParts = tr.endTime.split(":");

    if (startParts.length === 2 && endParts.length === 2) {
      const startTime = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endTime = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

      // Log time check details
      logger.debug(
        `Time check for "${rule.name}": ` +
          `Current time is ${Math.floor(currentTime / 60)}:${(currentTime % 60)
            .toString()
            .padStart(2, "0")}, ` +
          `Allowed range is ${tr.startTime} - ${tr.endTime}`
      );

      if (currentTime < startTime || currentTime > endTime) {
        return false;
      }
    }
  }

  return true;
};

// Register device with server
const registerDevice = async (deviceData, userId, token, apiUrl) => {
  try {
    logger.info(`Registering device: ${deviceData.name || "Unknown device"}`);

    // Add user ID to device data
    const deviceDataWithUser = {
      ...deviceData,
      userId: userId,
    };

    // Try to register device via API
    try {
      const response = await axios.post(
        `${apiUrl}/agent/devices/register`,
        deviceDataWithUser,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache", // Add cache control header
          },
        }
      );

      if (response.data && response.data.success) {
        logger.info(
          `Device registered successfully: ${
            deviceData.name || deviceData.deviceId
          }`
        );
        return {
          success: true,
          deviceId: response.data.deviceId || null,
          data: response.data,
        };
      } else {
        logger.warn(
          `Failed to register device via API: ${
            response.data?.error || "Unknown error"
          }`
        );
        throw new Error(response.data?.error || "Failed to register device");
      }
    } catch (error) {
      logger.error(`Error registering device via API: ${error.message}`);
      throw error;
    }
  } catch (error) {
    logger.error(`Device registration error: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  getRules,
  sendActivityLogs,
  isRuleActive,
  registerDevice,
  saveRulesToDisk,
  loadRulesFromDisk,
  checkTimeRestriction,
  updateRulesStore,
  getRulesArray,
  findRules,
  findBlockRulesForDomain,
  findAllowRulesForDomain,
  isDomainBlocked,
  getRulesSyncStatus,
  hasRulesForResource,
  processDifferencesBetweenRuleSets
};
