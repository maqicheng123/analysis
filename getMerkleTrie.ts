import fs from "fs";
import path from "path";
import { program } from "commander";
import { SecureTrie as Trie } from "merkle-patricia-tree";
import { Address } from "ethereumjs-util";
import { Common } from "@rei-network/common";
import { Database, createEncodingLevelDB } from "@rei-network/database";
import { StateManager } from "@rei-network/core";
import {
  TrieNode,
  BranchNode,
  ExtensionNode,
  LeafNode,
} from "merkle-patricia-tree/dist/trieNode";

program.option("--path <path>", "chaindb path"); //Users/xiaodong/Desktop/workspace/rei-dev/node4
program.option("--network <network>", "network name"); //rei-devnet  rei-mainnet
program.parse(process.argv);
const options = program.opts();

if (!options.path || !options.network) {
  console.log("please input path and network");
  process.exit(1);
}

const common = new Common({ chain: options.network });
common.setHardforkByBlockNumber(0);
const chaindb = createEncodingLevelDB(path.join(options.path, "chaindb"));
const db = new Database(chaindb, common);

const filePath = path.join(__dirname, "accountTrie.csv");
const filePathIncrease = path.join(__dirname, "/accountTrieIncrease" + ".csv");
//master  2700.66   hardhork  2739.26
async function main() {
  const data: { blockNumber: number; trieSize: number; nodes: TrieNode[] }[] =
    [];
  for (let i = 0; i <= 100; i++) {
    const result = await getTireSize(i);
    data.push({ blockNumber: i, trieSize: result.size, nodes: result.nodes });
  }

  const result: { interval: string; increaseSize: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === data.length - 1) {
      break;
    }
    const size = getIncreaseSize(data[i].nodes, data[i + 1].nodes);
    result.push({
      interval: `${i} -> ${i + 1}`,
      increaseSize: size,
    });
  }
  wirte2CSV(data);
  wirte2CSVIncrease(result);
}

async function getTireSize(num: number) {
  const block = await db.getBlock(num);
  const stateManager = new StateManager({
    common: block._common,
    trie: new Trie(chaindb),
  });
  await stateManager.setStateRoot(block.header.stateRoot);
  const accountTrie = await stateManager._getStorageTrie(
    Address.fromString("0x0000000000000000000000000000000000001001")
  );

  const nodes = await walkTrie(accountTrie, accountTrie.root);
  const result = nodes.reduce((previousValue, item) => {
    return previousValue + item.serialize().length + item.hash().length;
  }, 0);
  console.log("stakeManager merkle tire size at block ", num, "is ", result);
  return { size: result, nodes };
}

async function walkTrie(tire: Trie, root: Buffer) {
  const nodes: TrieNode[] = [];
  const onFound = async (node: TrieNode | null) => {
    if (node === null) {
      return;
    }
    nodes.push(node);
    if (node instanceof BranchNode) {
      const child = node.getChildren();
      for (let i = 0; i < child.length; i++) {
        const node = await tire.lookupNode(child[i][1] as Buffer);
        if (node != null) {
          await onFound(node);
        }
      }
    } else if (node instanceof ExtensionNode) {
      const value = node.raw()[1];
      const nextNode = await tire.lookupNode(value);
      await onFound(nextNode);
    } else if (node instanceof LeafNode) {
      // console.log("leaf node", node);
    }
  };
  const node = await tire.lookupNode(root);
  await onFound(node);
  return nodes;
}

function getIncreaseSize(nodes1: TrieNode[], nodes2: TrieNode[]) {
  return nodes2.reduce((previousValue, item) => {
    if (nodes1.find((node) => node.hash().equals(item.hash()))) {
      return previousValue;
    } else {
      return previousValue + item.serialize().length + item.hash().length;
    }
  }, 0);
}

function wirte2CSV(data: { blockNumber: number; trieSize: number }[]) {
  const header = ["blockNumber", "trieSize"].join(",") + "\r\n";
  const csvData = data.map((item) => {
    const csv: string[] = [];
    csv.push(item.blockNumber.toString());
    csv.push(item.trieSize.toString());
    return csv.join(",") + "\r\n";
  });
  const c = [header, ...csvData].join("");
  fs.writeFileSync(filePath, c);
}

function wirte2CSVIncrease(data: { interval: string; increaseSize: number }[]) {
  let sum = 0;
  let count = 0;
  for (const item of data.slice(50)) {
    sum += item.increaseSize;
    count++;
  }
  console.log("increase avg ====>", sum / count);
  const header = ["interval", "increaseSize"].join(",") + "\r\n";
  const csvData = data.map((item) => {
    const csv: string[] = [];
    csv.push(item.interval);
    csv.push(item.increaseSize.toString());
    return csv.join(",") + "\r\n";
  });
  const c = [header, ...csvData].join("");
  fs.writeFileSync(filePathIncrease, c);
}

main();
