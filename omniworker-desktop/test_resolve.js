const path = require('path');
const __dirname_simulated = path.join(process.cwd(), 'out', 'main');
const p = path.resolve(__dirname_simulated, "../../omniworker-agent/scripts/install.sh");
console.log(p);
