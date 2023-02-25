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

      // BigNumber 减法(sub)，保证精度
      // 直接用 - 运算符结果为 50.00000000010853
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
      // user (getSigners得到的第二个地址，定义见开头) 用 10 ETH 去换 TOKEN, 期望得到至少 18 TOKEN
      await exchange
      .connect(user)
      .ethToTokenSwap(toWei(18), { value: toWei(10) });
      // Contract.connect() 返回一个新的 Contract 实例，不会改变 exchange 的 signer
      // 所以下面的 removeLiquidity() 的执行者仍是 owner, 不是 user
      await exchange.removeLiquidity(toWei(100));
      
      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await getBalance(exchange.address)).to.equal(toWei(0));
      expect(fromWei(await token.balanceOf(user.address))).to.equal(
        "18.01637852593266606" // user 得到了这么多
      );

      const userEtherBalanceAfter = await getBalance(owner.address);
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      expect(
        fromWei(userEtherBalanceAfter.sub(userEtherBalanceBefore))
      ).to.equal("109.999947541231489464"); // 110 - gas fees <= 原作者代码给的是109.99999999996801，总之是 gas 影响，不管了

      expect(
        fromWei(userTokenBalanceAfter.sub(userTokenBalanceBefore))
      ).to.equal("181.98362147406733394"); // token 数量正确就行
    })

    it("burns LP-tokens", async () => {
      // changeTokenBalance(token, account, balance)
      // 参考：https://hardhat.org/hardhat-chai-matchers/docs/reference
      // 断言一个地址的 ERC20 代币余额改变了特定数量
      await expect(() =>
        exchange.removeLiquidity(toWei(25))
      ).to.changeTokenBalance(exchange, owner, toWei(-25));

      expect(await exchange.totalSupply()).to.equal(toWei(75));
    });

    it("doesn't allow invalid amount", async () => {
      await expect(exchange.removeLiquidity(toWei(100.1))).to.be.revertedWith(
        "ERC20: burn amount exceeds balance"
        // 这里原作者代码是 "burn amount exceeds balance"
        // 他的测试代码开头引入的是 @nomiclabs/hardhat-waffle, 这个 hardhat 不建议再用了
        // 转而使用新的 @nomicfoundation/hardhat-toolbox
        // 经过实测，原作者代码无论 "burn" 前面有没有 "ERC20: "都不会报错
        // 可能 hardhat-toolbox 比较严格？因为会报错：
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

  // 注意：收取费用后，原先的计算结果不再适用
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