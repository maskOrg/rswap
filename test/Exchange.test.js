require("@nomicfoundation/hardhat-toolbox");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = value => ethers.utils.parseEther(value.toString())

const fromWei = value => ethers.utils.formatEther(
  typeof value == 'string' ? value : value.toString()
)

const getBalance = ethers.provider.getBalance;

describe("Exchange", () => {
  let owner;
  let user;
  let token;
  let exchange;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TKN", toWei(1000000));
    await token.deployed();

    const Exchange = await ethers.getContractFactory("Exchange");
    exchange = await Exchange.deploy(token.address);
    await exchange.deployed();
  })

  it("is deployed", async () => {
    expect(await exchange.deployed()).to.equal(exchange);
  })

  describe("addLiquidity", async () => {
    it("adds liquidity", async () => {
      await token.approve(exchange.address, toWei(200));
      await exchange.addLiquidity(toWei(200), {value: toWei(100) });

      expect(await getBalance(exchange.address)).to.equal(toWei(100));
      expect(await exchange.getReserve()).to.equal(toWei(200));
    })
  })

  it("allows zero amounts", async () => {
    await token.approve(exchange.address, 0);
    await exchange.addLiquidity(0, { value: 0 });

    expect(await getBalance(exchange.address)).to.equal(0);
    expect(await exchange.getReserve()).to.equal(0);
  });

  describe("getTokenAmount", async () => {
    it("returns correnct token amount", async () => {
      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), {value: toWei(1000)});
      let tokensOut = await exchange.getTokenAmount(toWei(500));
      
      expect(fromWei(tokensOut)).to.equal("666.666666666666666666");
    })
  });

  describe("getEthAmount", async () => {
    it("returns correct ether amount", async () => {
      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let ethOut = await exchange.getEthAmount(toWei(500));
      expect(fromWei(ethOut)).to.equal("200.0");
    });
  });

  describe("tokenToEthSwap", async () => {
    beforeEach(async () => {
      await token.transfer(user.address, toWei(500));
      await token.connect(user).approve(exchange.address, toWei(500));

      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("transfers at least min amount of tokens", async () => {
      await exchange.connect(user).tokenToEthSwap(toWei(500), toWei(199));
      const userTokenBalanceAfter = await token.balanceOf(user.address);
      const exchangeTokenBalanceAfter = await token.balanceOf(exchange.address);
      expect(fromWei(exchangeTokenBalanceAfter)).to.equal("2500.0");
      expect(fromWei(userTokenBalanceAfter)).to.equal("0.0");
    })

    it("fails when output amount is less than min amount", async () => {
      await expect(exchange.connect(user).tokenToEthSwap(toWei(500), toWei(201))).to.be.revertedWith("insufficient output amount"); // 应写成 await expect(func()) 而不是 expect(await func())，因为 func() 是要报错的
    })

    it("allows zero swaps", async () => {
      await exchange.connect(user).tokenToEthSwap(toWei(0), toWei(0));

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("500.0");

      const exchangeEthBalance = await getBalance(exchange.address);
      expect(fromWei(exchangeEthBalance)).to.equal("1000.0");

      const exchangeTokenBalance = await token.balanceOf(exchange.address);
      expect(fromWei(exchangeTokenBalance)).to.equal("2000.0");
    });
  });
})