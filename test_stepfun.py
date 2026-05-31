from pathlib import Path
import requests, base64

invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
stream = True

headers = {
  "Authorization": "Bearer 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",
  "Accept": "text/event-stream" if stream else "application/json"
}

payload = {
  "model": "stepfun-ai/step-3.7-flash",
  "messages": [{"role":"user","content":"Say hello in one sentence"}],
  "max_tokens": 4096,
  "temperature": 1.00,
  "top_p": 0.95,
  "stream": stream,
}

response = requests.post(invoke_url, headers=headers, json=payload, stream=stream)
if stream:
    for line in response.iter_lines():
        if line:
            print(line.decode("utf-8"))
else:
    print(response.json())
