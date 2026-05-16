async function test() {
  const urls = [
    "http://localhost:3000/api/admin/providers",
    "http://localhost:3000/api/admin/tenants",
    "http://localhost:3000/api/admin/plans",
    "http://localhost:3000/api/admin/audit"
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      console.log(`URL: ${url} -> Status: ${r.status} Body: ${text.substring(0, 50)}`);
    } catch (e) {
      console.log(`URL: ${url} -> Error: ${e.message}`);
    }
  }
}
test();
