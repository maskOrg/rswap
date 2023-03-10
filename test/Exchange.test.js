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

  describe("removeLiquidity", async () => {
    beforeEach(async () => {
      await token.approve(exchange.address, toWei(300));
      await exchange.addLiquidity(toWei(200), { value: toWei(100) });
      // 100 ETH = 200 TOKEN
      // LP amount = 100
    })

    it("removes some liquidity", async () => {
      const userEtherBalanceBefore = await getBalance(owner.address);
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange.removeLiquidity(toWei(25)); // LP amount - 25
      expect(await exchange.getReserve()).to.equal(toWei(150));
      expect(await getBalance(exchange.address)).to.equal(toWei(75));

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);
      
      // expect(
      //   fromWei(userEtherBalanceAfter.sub(userEtherBalanceBefore))
      // ).to.equal("24.99999999993602"); // 25 - gas fees

      // BigNumber ??????(sub)???????????????
      // ????????? - ?????????????????? 50.00000000010853
      expect(
        fromWei(userTokenBalanceAfter.sub(userTokenBalanceBefore))
      ).to.equal("50.0");
    })

    it("removes all liquidity", async () => {
      const userEtherBalanceBefore = await getBalance(owner.address);
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange.removeLiquidity(toWei(100));

      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await getBalance(exchange.address)).to.equal(toWei(0));

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      // expect(
      //   fromWei(userEtherBalanceAfter.sub(userEtherBalanceBefore))
      // ).to.equal("99.99999999996801"); // 100 - gas fees

      expect(
        fromWei(userTokenBalanceAfter.sub(userTokenBalanceBefore))
      ).to.equal("200.0");
    });

    it("pays for provided liquidity", async() => {
      const userEtherBalanceBefore = await getBalance(owner.address);
      const userTokenBalanceBefore = await token.balanceOf(owner.address);
      // user (getSigners??????????????????????????????????????????) ??? 10 ETH ?????? TOKEN, ?????????????????? 18 TOKEN
      await exchange
      .connect(user)
      .ethToTokenSwap(toWei(18), { value: toWei(10) });
      // Contract.connect() ?????????????????? Contract ????????????????????? exchange ??? signer
      // ??????????????? removeLiquidity() ?????????????????? owner, ?????? user
      await exchange.removeLiquidity(toWei(100));
      
      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await getBalance(exchange.address)).to.equal(toWei(0));
      expect(fromWei(await token.balanceOf(user.address))).to.equal(
        "18.01637852593266606" // user ??????????????????
      );

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      expect(
        fromWei(userEtherBalanceAfter.sub(userEtherBalanceBefore))
      ).to.equal("109.999947541231489464"); // 110 - gas fees <= ????????????????????????109.99999999996801???????????? gas ??????????????????

      expect(
        fromWei(userTokenBalanceAfter.sub(userTokenBalanceBefore))
      ).to.equal("181.98362147406733394"); // token ??????????????????
    })

    it("burns LP-tokens", async () => {
      // changeTokenBalance(token, account, balance)
      // ?????????https://hardhat.org/hardhat-chai-matchers/docs/reference
      // ????????????????????? ERC20 ?????????????????????????????????
      await expect(() =>
        exchange.removeLiquidity(toWei(25))
      ).to.changeTokenBalance(exchange, owner, toWei(-25));

      expect(await exchange.totalSupply()).to.equal(toWei(75));
    });

    it("doesn't allow invalid amount", async () => {
      await expect(exchange.removeLiquidity(toWei(100.1))).to.be.revertedWith(
        "ERC20: burn amount exceeds balance"
        // ???????????????????????? "burn amount exceeds balance"
        // ???????????????????????????????????? @nomiclabs/hardhat-waffle, ?????? hardhat ??????????????????
        // ?????????????????? @nomicfoundation/hardhat-toolbox
        // ???????????????????????????????????? "burn" ??????????????? "ERC20: "???????????????
        // ?????? hardhat-toolbox ?????????????????????????????????
        // AssertionError: Expected transaction to be reverted with reason 'burn amount exceeds balance', but it reverted with reason 'ERC20: burn amount exceeds balance'
      );
    });
  })

  it("allows zero amounts", async () => {
    await token.approve(exchange.address, 0);
    await exchange.addLiquidity(0, { value: 0 });

    expect(await getBalance(exchange.address)).to.equal(0);
    expect(await exchange.getReserve()).to.equal(0);
  });

  // ????????????????????????????????????????????????????????????
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
      await expect(exchange.connect(user).tokenToEthSwap(toWei(500), toWei(201))).to.be.revertedWith("insufficient output amount"); // ????????? await expect(func()) ????????? expect(await func())????????? func() ???????????????
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