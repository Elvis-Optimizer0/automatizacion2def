import re
with open('app/ui/renderer.js', 'r', encoding='utf-8') as f:
    content = f.read()
ids = re.findall(r"id: '([^']+)'", content)
unique_ids = sorted(set(ids))
for id in unique_ids:
    print(id)