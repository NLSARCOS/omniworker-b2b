import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect('217.76.62.37', username='root', password='19748961Nl')
    stdin, stdout, stderr = client.exec_command('docker exec -i omniworker-saas-db-1 psql -U postgres -d omniworker -c "SELECT 1;" || docker exec -i omniworker-db-1 psql -U postgres -d omniworker -c "SELECT 1;"')
    print("STDOUT:", stdout.read().decode())
    print("STDERR:", stderr.read().decode())
finally:
    client.close()
