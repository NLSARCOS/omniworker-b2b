import paramiko
import os
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

# Configuration
VPS_IP = '217.76.62.37'
VPS_PORT = 2424
VPS_USER = 'root'
VPS_PASS = 'Santiago1206'
REPO_PATH = "/Users/nelsonsarcos/Documents/Simplet Pyects/aass2"

code_files = [
    "omniworker-saas/src/app/dashboard/page.tsx",
    "omniworker-saas/src/lib/auth.ts",
    "omniworker-agent/run_agent.py",
    "omniworker-agent/omniworker_cli/runtime_provider.py",
    "omniworker-agent/agent/auxiliary_client.py"
]

installer_files = [
    ("omniworker-desktop/dist/omniworker-desktop-0.4.5-x64.dmg", "omniworker-desktop-0.4.5-x64.dmg"),
    ("omniworker-desktop/dist/omniworker-desktop-0.4.5-x64.dmg.blockmap", "omniworker-desktop-0.4.5-x64.dmg.blockmap"),
    ("omniworker-desktop/dist/latest-mac.yml", "latest-mac.yml"),
    ("omniworker-desktop/dist/omniworker-desktop-0.4.5-x64-mac.zip", "omniworker-desktop-0.4.5-x64-mac.zip"),
    ("omniworker-desktop/dist/omniworker-desktop-0.4.5-x64-mac.zip.blockmap", "omniworker-desktop-0.4.5-x64-mac.zip.blockmap")
]

try:
    print(f"Connecting to VPS {VPS_IP}:{VPS_PORT}...")
    client.connect(VPS_IP, port=VPS_PORT, username=VPS_USER, password=VPS_PASS, timeout=20)
    print("Connected successfully!")
    
    sftp = client.open_sftp()
    
    # 1. Sync code files
    print("\n--- SYNCING CODE FILES ---")
    for rel_path in code_files:
        local_path = os.path.join(REPO_PATH, rel_path)
        remote_path = os.path.join("/opt/omniworker", rel_path)
        
        # Ensure remote directory exists
        remote_dir = os.path.dirname(remote_path)
        dir_parts = remote_dir.split('/')
        current_dir = ""
        for part in dir_parts:
            if not part:
                continue
            current_dir += "/" + part
            try:
                sftp.stat(current_dir)
            except IOError:
                print(f"Creating directory: {current_dir}")
                sftp.mkdir(current_dir)
                
        print(f"Uploading code: {local_path} -> {remote_path}...")
        sftp.put(local_path, remote_path)
        
    # 2. Upload installer files
    print("\n--- UPLOADING INSTALLER FILES ---")
    dest_dirs = ["/opt/omniworker/downloads", "/opt/omniworker-downloads"]
    for dest_dir in dest_dirs:
        try:
            sftp.stat(dest_dir)
        except IOError:
            print(f"Creating directory: {dest_dir}")
            sftp.mkdir(dest_dir)
            
        for local_rel, filename in installer_files:
            local_path = os.path.join(REPO_PATH, local_rel)
            remote_path = os.path.join(dest_dir, filename)
            
            if os.path.exists(local_path):
                print(f"Uploading installer: {local_path} -> {remote_path}...")
                sftp.put(local_path, remote_path)
            else:
                print(f"ERROR: Local file does not exist: {local_path}")
                sys.exit(1)
                
    sftp.close()
    print("All file transfers completed successfully!")
    
    # 3. Create symlinks
    print("\n--- CREATING SYMLINKS ON VPS ---")
    symlink_commands = [
        "ln -sf omniworker-desktop-0.4.5-x64.dmg /opt/omniworker/downloads/OmniWorker-v5.dmg",
        "ln -sf omniworker-desktop-0.4.5-x64.dmg /opt/omniworker-downloads/OmniWorker-v5.dmg",
        "ln -sf omniworker-desktop-0.4.5-x64.dmg /opt/omniworker-downloads/omniworker-desktop-0.4.5-arm64.dmg",
        "ln -sf omniworker-desktop-0.4.5-x64.dmg /opt/omniworker/downloads/omniworker-desktop-0.4.5-arm64.dmg",
        "ls -la /opt/omniworker-downloads/OmniWorker-v5.dmg",
        "ls -la /opt/omniworker-downloads/omniworker-desktop-0.4.5-arm64.dmg"
    ]
    for cmd in symlink_commands:
        print(f"Exec: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        print(stdout.read().decode('utf-8', errors='ignore').strip())
        err = stderr.read().decode('utf-8', errors='ignore').strip()
        if err:
            print(f"Error output: {err}")
            
    # 4. Rebuild SaaS docker container
    print("\n--- REBUILDING SAAS CONTAINER ---")
    rebuild_cmd = "cd /opt/omniworker/omniworker-saas && docker compose up -d --build"
    print(f"Executing: {rebuild_cmd}")
    stdin, stdout, stderr = client.exec_command(rebuild_cmd)
    
    while True:
        line = stdout.readline()
        if not line:
            break
        print(line, end="")
        
    err = stderr.read().decode('utf-8', errors='ignore')
    if err:
        print(f"Rebuild STDERR: {err}")
        
    # Check docker status
    print("\n--- DOCKER STATUS ---")
    stdin, stdout, stderr = client.exec_command("docker ps")
    print(stdout.read().decode('utf-8', errors='ignore'))
    
except Exception as e:
    print(f"Deployment failed: {e}")
    sys.exit(1)
finally:
    client.close()
