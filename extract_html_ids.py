import re
with open('app/ui/index.html', 'r', encoding='utf-8') as f:
    content = f.read()
ids = re.findall(r'id="([^"]+)"', content)
unique_ids = sorted(set(ids))
for id in sorted(set(ids)):
    print(id)