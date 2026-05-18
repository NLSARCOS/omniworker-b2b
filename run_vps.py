import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect('217.76.62.37', username='root', password='Santiago1206')
    print("Connected to VPS")
    
    # Get docker containers
    stdin, stdout, stderr = client.exec_command('docker ps --format "{{.Names}}" | grep -i db')
    db_containers = stdout.read().decode().strip().split('\n')
    
    if not db_containers or not db_containers[0]:
        print("No DB container found!")
        sys.exit(1)
        
    db_container = db_containers[0]
    print(f"Using container: {db_container}")
    
    # Execute SQL
    sql = """
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "tokenBalance", "isActive", "createdAt")
    VALUES (gen_random_uuid()::text, 'user@user.com', crypt('user@user.com', gen_salt('bf', 10)), 'Test User', 'USER', 10000000, true, now())
    ON CONFLICT ("email") DO UPDATE SET "tokenBalance" = 10000000, "passwordHash" = crypt('user@user.com', gen_salt('bf', 10));
    """
    
    command = f'docker exec -i {db_container} psql -U postgres -d omniworker'
    stdin, stdout, stderr = client.exec_command(command)
    stdin.write(sql)
    stdin.channel.shutdown_write()
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
    
finally:
    client.close()
