import fs from "fs";
import path from "path";
import { SecureTrie as Trie } from "merkle-patricia-tree";
import { Address } from "ethereumjs-util";
import { Common } from "@rei-network/common";
import { Database, createEncodingLevelDB } from "@rei-network/database";
import { StateManager } from "@rei-network/core";
//stateManager accoubt mekle trie data increase avg  29301.65
const common = new Common({ chain: "rei-devnet" });
common.setHardforkByBlockNumber(0);
// const chaindb = createEncodingLevelDB(path.join('/root/mainnet/debug1', 'chaindb'));
const chaindb = createEncodingLevelDB(
  path.join("/Users/xiaodong/Desktop/workspace/rei-dev/node4", "chaindb")
);
const db = new Database(chaindb, common);
const filePath = path.join(__dirname, "/analysis_accountTrieIncrease" + ".csv");

async function main() {
  const blockNumber = 50;
  // const blockNumber = 4000000;
  const start = blockNumber - 50;
  const end = blockNumber + 50;
  let data: { blockNumber: number; dataMap: Map<Buffer, Buffer> }[] = [];
  for (let i = start; i <= end; i++) {
    let res = await getAccountTrieData(i);
    data.push(res as any);
  }
  const diffs: {
    index: number;
    interval: string;
    newKeyCount: number;
    keyIncreaseSize: number;
    valueIncreaseSize: number;
    increaseSize: number;
  }[] = [];
  let index = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i === data.length - 1) {
      break;
    }
    // const diff = getDiff(Array.from(data[i].dataMap.keys()), Array.from(data[i + 1].dataMap.keys()));
    const diff = getDiff1(data[i].dataMap, data[i + 1].dataMap);
    let keyIncreaseSize = 0;
    let valueIncreaseSize = 0;
    for (const key of diff) {
      keyIncreaseSize += 32;
      valueIncreaseSize += data[i + 1].dataMap.get(key)?.length!;
    }
    if (data[i + 1].blockNumber > 7011452) {
      sum += valueIncreaseSize + keyIncreaseSize;
    }
    diffs.push({
      index,
      interval: data[i].blockNumber + "-->" + data[i + 1].blockNumber,
      newKeyCount: diff.length,
      keyIncreaseSize,
      valueIncreaseSize,
      increaseSize: valueIncreaseSize + keyIncreaseSize,
    });
    index++;
  }
  console.log("increase avg ==>", sum / 100);
  wirte2CSV(diffs);
}

async function getAccountTrieData(num: number) {
  const block = await db.getBlock(num);
  const stateManager = new StateManager({
    common: block._common,
    trie: new Trie(chaindb),
  });
  await stateManager.setStateRoot(block.header.stateRoot);
  const accountTrie = await stateManager._getStorageTrie(
    Address.fromString("0x0000000000000000000000000000000000001001")
  );
  console.log("blockNumber ==>", num);
  console.log("account stateRoot ==>", accountTrie.root.toString("hex"));
  return new Promise(async (resolve) => {
    let dataMap = new Map<Buffer, Buffer>();
    accountTrie
      .createReadStream()
      .on("data", (data: any) => {
        dataMap.set(data.key, data.value);
      })
      .on("end", () => {
        console.log("trie data size =>", dataMap.size);
        resolve({ blockNumber: num, dataMap });
      });
  });
}

//to do work tire data

function wirte2CSV(
  data: {
    index: number;
    interval: string;
    newKeyCount: number;
    keyIncreaseSize: number;
    valueIncreaseSize: number;
    increaseSize: number;
  }[]
) {
  const header =
    [
      "index",
      "interval",
      "newKeyCount",
      "keyIncreaseSize",
      "valueIncreaseSize",
      "increateSize",
    ].join(",") + "\r\n";
  const csvData = data.map((item) => {
    const csv: string[] = [];
    csv.push(item.index.toString());
    csv.push(item.interval);
    csv.push(item.newKeyCount.toString());
    csv.push(item.keyIncreaseSize.toString());
    csv.push(item.valueIncreaseSize.toString());
    csv.push(item.increaseSize.toString());
    return csv.join(",") + "\r\n";
  });
  const c = [header, ...csvData].join("");
  fs.writeFileSync(filePath, c);
}

function getDiff1(
  dataMap1: Map<Buffer, Buffer>,
  dataMap2: Map<Buffer, Buffer>
) {
  const diffDataKey: Buffer[] = [];
  const keys2 = Array.from(dataMap2.keys());
  const keys1 = Array.from(dataMap1.keys());
  kkk: for (const key2 of keys2) {
    for (const key1 of keys1) {
      if (key2.equals(key1)) {
        const value2 = dataMap2.get(key2)!;
        const value1 = dataMap1.get(key1)!;
        if (!value2.equals(value1)) {
          console.log(value2, value1);
          console.log(value2.length, value1.length);
          diffDataKey.push(key2);
          continue kkk;
        }
      }
    }
    diffDataKey.push(key2);
  }
  return diffDataKey;
}

main();
