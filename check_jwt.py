import json, base64, time

token_payload = "eyJ1c2VySWQiOiJmN2I1YjA3Ny1kOTkzLTQ1MjYtYTBiZC04Y2IxNDJhYWY3M2QiLCJlbWFpbCI6InVzZXJAdXNlci5jb20iLCJyb2xlIjoiVVNFUiIsInRlbmFudElkIjpudWxsLCJkZXZpY2VGaW5nZXJwcmludCI6ImUwYWRkYjkxLWM0OTEtNGVmMy05NmYwLTE3MDc5ZTQ1NTBiNyIsImlhdCI6MTc3OTYwMjI4MSwiZXhwIjoxNzc5NjAzMTgxfQ"

# Add padding
token_payload += "=" * (4 - len(token_payload) % 4)

payload = json.loads(base64.b64decode(token_payload))
print(f"User: {payload['email']}")
print(f"Issued: {time.ctime(payload['iat'])}")
print(f"Expires: {time.ctime(payload['exp'])}")
print(f"Now: {time.ctime(time.time())}")
print(f"Token lifetime: {(payload['exp'] - payload['iat'])/60:.0f} minutes")
print(f"Expired: {time.time() > payload['exp']}")
print(f"Time since expiry: {(time.time() - payload['exp'])/3600:.1f} hours")
