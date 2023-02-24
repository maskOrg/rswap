const { expect } = require("chai");
const { ethers } = require("hardhat");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");

describe("Token", () => {
  let owner;
  let token;

  before(async () => {
    [owner] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TKN", 11451);
    await token.deployed();
  })

  it("sets name and symbol when created", async () => {
    expect((await token.name())).to.equal("Token");
    expect((await token.symbol())).to.equal("TKN");
  })

  it("mints initialSupply to msg.sender when created", async () => {
    expect(await token.totalSupply()).to.equal(11451);
    expect(await token.balanceOf(owner.address)).to.equal(11451);
  });
})