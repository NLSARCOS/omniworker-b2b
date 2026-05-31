from openai import OpenAI

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = "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"
)

completion = client.chat.completions.create(
  model="mistralai/mistral-nemotron",
  messages=[{"role":"user","content":"Say hello in one sentence"}],
  temperature=0.6,
  top_p=0.7,
  max_tokens=4096,
  stream=True
)

for chunk in completion:
  if chunk.choices and chunk.choices[0].delta.content is not None:
    print(chunk.choices[0].delta.content, end="")
print()
