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
    base_ip = get_ip_range()
    print(f"Scanning network range: {base_ip}.0/24")
    
    # Using ARP scan through Windows command
    try:
        result = subprocess.run(['arp', '-a'], capture_output=True, text=True)
        output = result.stdout
    except Exception as e:
        print(f"Error running ARP command: {e}")
        return []
    
    # Parse ARP output
    devices = []
    ip_pattern = re.compile(rf"{re.escape(base_ip)}\.\d+")
    for line in output.splitlines():
        if base_ip in line:
            ip_match = ip_pattern.search(line)
            if ip_match:
                ip = ip_match.group(0)
                
                # Extract MAC address
                mac_match = re.search(r'([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})', line)
                if not mac_match:
                    continue
                
                mac = mac_match.group(0).replace('-', ':').lower()
                
                # Create device info
                hostname = get_hostname(ip)
                device_id = mac.replace(':', '')
                
                device_info = {
                    "device_id": device_id,
                    "ip_address": ip,
                    "mac_address": mac,
                    "hostname": hostname,
                    "device_type": guess_device_type(hostname),
                    "os_type": guess_os_type(hostname),
                    "is_trusted": False,  # Default to untrusted
                    "system_info": {
                        "detection_method": "network_scan",
                        "scan_time": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                }
                devices.append(device_info)
                print(f"Found device: {hostname} ({ip}) - {mac}")
    
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