from openai import OpenAI
import time

client = OpenAI(
  base_url = "https://integrate.api.nvidia.com/v1",
  api_key = "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"
)

# Test 1: Full thinking (baseline)
print("=== TEST 1: Full thinking (no budget) ===")
t1 = time.time()
c1 = client.chat.completions.create(
  model="z-ai/glm-5.1",
  messages=[{"role":"user","content":"What is 25 * 37?"}],
  temperature=0.6,
  max_tokens=4096,
  extra_body={"chat_template_kwargs":{"enable_thinking":True,"clear_thinking":True}},
)
elapsed1 = time.time() - t1
print(f"Response: {c1.choices[0].message.content}")
print(f"Time: {elapsed1:.1f}s")
print(f"Tokens: {c1.usage}")
print()

# Test 2: Thinking with budget of 1024
print("=== TEST 2: Thinking with budget=1024 ===")
t2 = time.time()
c2 = client.chat.completions.create(
  model="z-ai/glm-5.1",
  messages=[{"role":"user","content":"What is 25 * 37?"}],
  temperature=0.6,
  max_tokens=4096,
  extra_body={"chat_template_kwargs":{"enable_thinking":True,"clear_thinking":True,"thinking_budget":1024}},
)
elapsed2 = time.time() - t2
print(f"Response: {c2.choices[0].message.content}")
print(f"Time: {elapsed2:.1f}s")
print(f"Tokens: {c2.usage}")
print()

# Test 3: Thinking with budget of 256
print("=== TEST 3: Thinking with budget=256 ===")
t3 = time.time()
c3 = client.chat.completions.create(
  model="z-ai/glm-5.1",
  messages=[{"role":"user","content":"What is 25 * 37?"}],
  temperature=0.6,
  max_tokens=4096,
  extra_body={"chat_template_kwargs":{"enable_thinking":True,"clear_thinking":True,"thinking_budget":256}},
)
elapsed3 = time.time() - t3
print(f"Response: {c3.choices[0].message.content}")
print(f"Time: {elapsed3:.1f}s")
print(f"Tokens: {c3.usage}")
print()

# Test 4: No thinking at all
print("=== TEST 4: No thinking (enable_thinking=False) ===")
t4 = time.time()
c4 = client.chat.completions.create(
  model="z-ai/glm-5.1",
  messages=[{"role":"user","content":"What is 25 * 37?"}],
  temperature=0.6,
  max_tokens=4096,
  extra_body={"chat_template_kwargs":{"enable_thinking":False}},
)
elapsed4 = time.time() - t4
print(f"Response: {c4.choices[0].message.content}")
print(f"Time: {elapsed4:.1f}s")
print(f"Tokens: {c4.usage}")

print("\n=== SUMMARY ===")
print(f"Full thinking:    {elapsed1:.1f}s")
print(f"Budget 1024:      {elapsed2:.1f}s")
print(f"Budget 256:       {elapsed3:.1f}s")
print(f"No thinking:      {elapsed4:.1f}s")
