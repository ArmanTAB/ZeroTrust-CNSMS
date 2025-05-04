import socket
import subprocess
import re
import uuid
import platform
import requests
import json
import time

def get_my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def get_ip_range():
    my_ip = get_my_ip()
    # Extract first three octets
    ip_parts = my_ip.split('.')
    base_ip = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}"
    return base_ip

def get_hostname(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except:
        return "Unknown"

def scan_network():
    """Scan network to find devices using multiple methods"""
    base_ip = get_ip_range()
    logger.info(f"Scanning network range: {base_ip}.0/24")
    
    devices = []
    
    # Method 1: ARP Table Scan (existing method)
    try:
        result = subprocess.run(['arp', '-a'], capture_output=True, text=True)
        output = result.stdout
        # Parse ARP output (your existing code)
        ip_pattern = re.compile(rf"{re.escape(base_ip)}\.\d+")
        for line in output.splitlines():
            if base_ip in line:
                # Your existing parsing code here...
                pass
    except Exception as e:
        logger.error(f"Error running ARP command: {e}")
    
    # Method 2: Active ping scan
    try:
        # More aggressive method - ping each address in the subnet
        for i in range(1, 255):
            ip = f"{base_ip}.{i}"
            # Use ping with short timeout
            ping_cmd = ["ping", "-c", "1", "-W", "0.2", ip] if platform.system() != "Windows" else ["ping", "-n", "1", "-w", "200", ip]
            
            # Run ping command
            ping_result = subprocess.run(ping_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            # If ping successful
            if ping_result.returncode == 0:
                # Try to get hostname and MAC
                hostname = get_hostname(ip)
                # Get MAC address via ARP (now that we've pinged it, it should be in ARP table)
                mac_result = subprocess.run(["arp", "-n", ip] if platform.system() != "Windows" else ["arp", "-a", ip], 
                                           capture_output=True, text=True)
                
                # Extract MAC from ARP output
                mac_match = re.search(r'([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})', mac_result.stdout)
                if mac_match:
                    mac = mac_match.group(0).replace('-', ':').lower()
                    device_id = mac.replace(':', '')
                    
                    # Skip if already found
                    if any(d["device_id"] == device_id for d in devices):
                        continue
                    
                    # Check if device exists in DB
                    existing_device = await get_device_by_id(device_id)
                    
                    # Create device info
                    device_info = {
                        "device_id": device_id,
                        "ip_address": ip,
                        "mac_address": mac,
                        "hostname": hostname,
                        "device_type": guess_device_type(hostname),
                        "os_type": guess_os_type(hostname),
                        "is_trusted": False,
                        "system_info": {
                            "detection_method": "network_scan",
                            "scan_time": datetime.utcnow().isoformat()
                        },
                        "already_registered": existing_device is not None
                    }
                    devices.append(device_info)
                    logger.info(f"Found device: {hostname} ({ip}) - {mac}")
    except Exception as e:
        logger.error(f"Error in ping scan: {e}")
    
    return devices

def guess_device_type(hostname):
    hostname = hostname.lower()
    if any(word in hostname for word in ['phone', 'iphone', 'android', 'mobile']):
        return "mobile"
    elif any(word in hostname for word in ['laptop', 'notebook']):
        return "laptop"
    elif any(word in hostname for word in ['server', 'nas', 'cloud']):
        return "server"
    elif any(word in hostname for word in ['router', 'gateway', 'ap', 'switch']):
        return "network"
    elif any(word in hostname for word in ['tv', 'roku', 'firestick', 'chromecast', 'camera']):
        return "iot"
    return "workstation"  # Default

def guess_os_type(hostname):
    hostname = hostname.lower()
    if any(word in hostname for word in ['win', 'windows', 'microsoft']):
        return "Windows"
    elif any(word in hostname for word in ['mac', 'apple', 'iphone', 'ipad']):
        return "Apple"
    elif any(word in hostname for word in ['android', 'pixel', 'galaxy']):
        return "Android"
    elif any(word in hostname for word in ['linux', 'ubuntu', 'debian']):
        return "Linux"
    return "Unknown OS"

def get_current_device():
    ip = get_my_ip()
    hostname = socket.gethostname()
    mac_address = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff) 
                           for elements in range(0,8*6,8)][::-1])
    
    # Get more detailed system info for current machine
    system_info = {
        "platform": platform.platform(),
        "processor": platform.processor(),
        "architecture": platform.architecture()[0],
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "node": platform.node(),
        "python_version": platform.python_version()
    }
    
    return {
        "device_id": mac_address.replace(":", ""),
        "ip_address": ip,
        "mac_address": mac_address,
        "hostname": hostname,
        "device_type": "workstation",
        "os_type": platform.system() + " " + platform.release(),
        "is_trusted": True,  # Current device is trusted
        "system_info": system_info
    }

def register_device(device):
    try:
        # Check if backend is running
        api_url = "http://localhost:8000/devices/register"
        print(f"Registering device: {device['hostname']} ({device['ip_address']})")
        response = requests.post(api_url, json=device)
        return response.json()
    except Exception as e:
        print(f"Error registering device: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    print("Starting network scan...")
    network_devices = scan_network()
    print(f"Found {len(network_devices)} devices on the network")
    
    # First register the current device with detailed info
    print("Registering current device...")
    current_device = get_current_device()
    result = register_device(current_device)
    print(f"Current device registration result: {json.dumps(result, indent=2)}")
    
    # Then register other network devices
    success_count = 0
    for device in network_devices:
        # Skip current device (already registered)
        if device["ip_address"] == current_device["ip_address"]:
            print(f"Skipping current device: {device['hostname']}")
            continue
        
        result = register_device(device)
        if "error" not in result:
            success_count += 1
        print(f"Result: {json.dumps(result, indent=2)}")
    
    print(f"Network scan complete. Registered {success_count} new devices.")