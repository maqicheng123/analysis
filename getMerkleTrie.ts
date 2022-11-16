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
//mastr 2700.66 hardfork 1668.4
program.option("--path <path>", "chaindb path"); //Users/xiaodong/Desktop/workspace/rei-dev/node4
program.option("--network <network>", "network name"); //rei-devnet  rei-mainnet
program.option("--block <block>", "block number"); //7011451
program.parse(process.argv);
const options = program.opts();
//ts-node getMerkleTrie.ts --path /Users/xiaodong/Desktop/workspace/rei-dev-hardfork/node4 --network rei-devnet --branch hardfork --block 50
if (
  !options.path ||
  !options.network ||
  (!options.block && options.block <= 100)
) {
  console.log("please input path and network");
  process.exit(1);
}

const common = new Common({ chain: options.network });
common.setHardforkByBlockNumber(0);
const chaindb = createEncodingLevelDB(path.join(options.path, "chaindb"));
const db = new Database(chaindb, common);

let increaseSumBefore = 0;
let increaseSumAfter = 0;
async function main() {
  initFile();
  const start = Number(options.block) - 100;
  const end = Number(options.block) + 100;
  await getTire(start, Number(options.block), 0);
  await getTire(Number(options.block), end, 1);
  console.log("increase avg before hardfork => ", increaseSumBefore / 100);
  console.log("increase avg after hardfork => ", increaseSumAfter / 100);
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

  const { nodes, dis } = await walkTrie(accountTrie, accountTrie.root);
  const result = nodes.reduce((previousValue, item) => {
    return previousValue + item.serialize().length + item.hash().length;
  }, 0);
  console.log("stakeManager merkle tire size at block ", num, "is ", result);
  return { size: result, nodes, dis };
}

async function walkTrie(tire: Trie, root: Buffer) {
  const nodes: TrieNode[] = [];
  const dis: number[] = [];
  const onFound = async (node: TrieNode | null, distance: number) => {
    if (node === null) {
      return;
    }
    nodes.push(node);
    if (node instanceof BranchNode) {
      const child = node.getChildren();
      for (let i = 0; i < child.length; i++) {
        const node = await tire.lookupNode(child[i][1] as Buffer);
        if (node != null) {
          await onFound(node, distance + 1);
        }
      }
    } else if (node instanceof ExtensionNode) {
      const value = node.raw()[1];
      const nextNode = await tire.lookupNode(value);
      await onFound(nextNode, distance + 1);
    } else if (node instanceof LeafNode) {
      // console.log("leaf node", node);
      dis.push(distance);
    }
  };
  const node = await tire.lookupNode(root);
  await onFound(node, 0);
  return { nodes, dis };
}

function getIncreaseSize(nodes1: TrieNode[], nodes2: TrieNode[]) {
  let count = 0;
  let increaseSize = nodes2.reduce((previousValue, item) => {
    if (nodes1.find((node) => node.hash().equals(item.hash()))) {
      return previousValue;
    } else {
      count++;
      return previousValue + item.serialize().length + item.hash().length;
    }
  }, 0);
  return { count, increaseSize };
}

//0 before hardfork 1 after hardfork
async function getTire(start: number, end: number, flag: number) {
  const filePath = `/account-trie-${flag === 0 ? "before" : "after"}.csv`;
  const filePathIncrease = `/account-trie-increase-${
    flag === 0 ? "before" : "after"
  }.csv`;
  const fileDisPath = `/account-trie-dis-${
    flag === 0 ? "before" : "after"
  }.csv`;

  const data: {
    blockNumber: number;
    nodes: TrieNode[];
    dis: number[];
  }[] = [];
  for (let i = start; i <= end; i++) {
    const result = await getTireSize(i);
    wirte2CSV(
      {
        blockNumber: i,
        trieSize: result.size,
      },
      path.join(__dirname, filePath)
    );
    wirte2CSVDis(
      {
        blockNumber: i,
        dis: result.dis,
      },
      path.join(__dirname, fileDisPath)
    );
    data.push({
      blockNumber: i,
      nodes: result.nodes,
      dis: result.dis,
    });
  }
  for (let i = 0; i < data.length; i++) {
    if (i === data.length - 1) {
      break;
    }

    const r = getIncreaseSize(data[i].nodes, data[i + 1].nodes);
    wirte2CSVIncrease(
      {
        index: i,
        interval: `${data[i].blockNumber} -> ${data[i + 1].blockNumber}`,
        count: r.count,
        increaseSize: r.increaseSize,
      },
      path.join(__dirname, filePathIncrease)
    );

    if (flag === 0) {
      increaseSumBefore += r.increaseSize;
    }
    if (flag === 1) {
      increaseSumAfter += r.increaseSize;
    }
  }
}

function initFile() {
  const header1 = ["blockNumber", "trieSize"].join(",") + "\r\n";
  const header2 =
    ["index", "interval", "increaseSize", "count"].join(",") + "\r\n";
  const header3 = ["blockNumber", "amount", "instance"].join(",") + "\r\n";
  fs.writeFileSync(path.join(__dirname, `/account-trie-before.csv`), header1);
  fs.writeFileSync(path.join(__dirname, `/account-trie-after.csv`), header1);
  fs.writeFileSync(
    path.join(__dirname, `/account-trie-dis-before.csv`),
    header2
  );
  fs.writeFileSync(
    path.join(__dirname, `/account-trie-dis-after.csv`),
    header2
  );
  fs.writeFileSync(
    path.join(__dirname, `/account-trie-dis-before.csv`),
    header3
  );
  fs.writeFileSync(
    path.join(__dirname, `/account-trie-dis-after.csv`),
    header3
  );
}

function wirte2CSV(
  item: { blockNumber: number; trieSize: number },
  path: string
) {
  const csv: string[] = [];
  csv.push(item.blockNumber.toString());
  csv.push(item.trieSize.toString());
  fs.writeFileSync(path, csv.join(",") + "\r\n", { flag: "a" });
}

function wirte2CSVIncrease(
  item: {
    index: number;
    interval: string;
    increaseSize: number;
    count: number;
  },
  path: string
) {
  const csv: string[] = [];
  csv.push(item.index.toString());
  csv.push(item.interval);
  csv.push(item.increaseSize.toString());
  csv.push(item.count.toString());
  fs.writeFileSync(path, csv.join(",") + "\r\n", { flag: "a" });
}

function wirte2CSVDis(
  item: { blockNumber: number; dis: number[] },
  path: string
) {
  const csv: string[] = [];
  csv.push(item.blockNumber.toString());
  csv.push(item.dis.length.toString());
  csv.push(item.dis.join("."));
  fs.writeFileSync(path, csv.join(",") + "\r\n", { flag: "a" });
}

main();
