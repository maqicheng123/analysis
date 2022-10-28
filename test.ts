import { program } from "commander";

program.option("--path <path>", "chaindb path"); //Users/xiaodong/Desktop/workspace/rei-dev/node4
program.option("--network <network>", "network name"); //rei-devnet  rei-mainnet
program.parse(process.argv);
const options = program.opts();
console.log("options", options);
