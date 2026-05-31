from openai import OpenAI
import os
import sys

_USE_COLOR = sys.stdout.isatty() and os.getenv("NO_COLOR") is None
_REASONING_COLOR = "\033[90m" if _USE_COLOR else ""
_RESET_COLOR = "\033[0m" if _USE_COLOR else ""

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = "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"
)


completion = client.chat.completions.create(
  model="z-ai/glm-5.1",
  messages=[{"role":"user","content":"Say hello in one sentence"}],
  temperature=1,
  top_p=1,
  max_tokens=16384,
  extra_body={"chat_template_kwargs":{"enable_thinking":True,"clear_thinking":False}},
  stream=True
)

for chunk in completion:
  if not getattr(chunk, "choices", None):
    continue
  if len(chunk.choices) == 0 or getattr(chunk.choices[0], "delta", None) is None:
    continue
  delta = chunk.choices[0].delta
  reasoning = getattr(delta, "reasoning_content", None)
  if reasoning:
    print(f"{_REASONING_COLOR}{reasoning}{_RESET_COLOR}", end="")
  if getattr(delta, "content", None) is not None:
    print(delta.content, end="")
