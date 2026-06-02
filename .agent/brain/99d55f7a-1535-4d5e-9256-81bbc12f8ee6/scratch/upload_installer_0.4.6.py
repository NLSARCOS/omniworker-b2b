import paramiko
import os

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print("Connecting to VPS on port 2424...")
    client.connect('217.76.62.37', port=2424, username='root', password='Santiago1206', timeout=15)
    print("Connected successfully!")
    
    sftp = client.open_sftp()
    
    files = [
        ("omniworker-desktop/dist/omniworker-desktop-0.4.6-x64.dmg", "omniworker-desktop-0.4.6-x64.dmg"),
        ("omniworker-desktop/dist/omniworker-desktop-0.4.6-x64.dmg.blockmap", "omniworker-desktop-0.4.6-x64.dmg.blockmap"),
        ("omniworker-desktop/dist/latest-mac.yml", "latest-mac.yml"),
        ("omniworker-desktop/dist/omniworker-desktop-0.4.6-x64-mac.zip", "omniworker-desktop-0.4.6-x64-mac.zip"),
        ("omniworker-desktop/dist/omniworker-desktop-0.4.6-x64-mac.zip.blockmap", "omniworker-desktop-0.4.6-x64-mac.zip.blockmap")
    ]
    
    dest_dirs = ["/opt/omniworker/downloads", "/opt/omniworker-downloads"]
    
    for dest_dir in dest_dirs:
        # Check if dir exists, if not, create it
        try:
            sftp.stat(dest_dir)
        except IOError:
            print(f"Creating directory: {dest_dir}")
            sftp.mkdir(dest_dir)
            
        for local_rel, filename in files:
            local_path = os.path.join("/Users/nelsonsarcos/Documents/Simplet Pyects/aass2", local_rel)
            remote_path = os.path.join(dest_dir, filename)
            
            if os.path.exists(local_path):
                print(f"Uploading {local_path} -> {remote_path}...")
                sftp.put(local_path, remote_path)
            else:
                print(f"WARNING: Local file does not exist: {local_path}")
                
    sftp.close()
    print("Files uploaded successfully!")
    
    # Create symlinks for version 0.4.6
    commands = [
        "ln -sf omniworker-desktop-0.4.6-x64.dmg /opt/omniworker/downloads/OmniWorker-v5.dmg",
        "ln -sf omniworker-desktop-0.4.6-x64.dmg /opt/omniworker-downloads/OmniWorker-v5.dmg",
        "ln -sf omniworker-desktop-0.4.6-x64.dmg /opt/omniworker-downloads/omniworker-desktop-0.4.6-arm64.dmg",
        "ln -sf omniworker-desktop-0.4.6-x64.dmg /opt/omniworker/downloads/omniworker-desktop-0.4.6-arm64.dmg",
        "ls -la /opt/omniworker-downloads/OmniWorker-v5.dmg",
        "ls -la /opt/omniworker-downloads/omniworker-desktop-0.4.6-arm64.dmg"
    ]
    
    for cmd in commands:
        print(f"Exec: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd)
        print(stdout.read().decode().strip())
        err = stderr.read().decode().strip()
        if err:
            print(f"Error: {err}")
            
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
