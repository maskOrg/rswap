pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Exchange is ERC20 {
    address public tokenAddress;
    constructor (address _token) ERC20("rswap-V1", "RUNE-V1") {
        require(_token != address(0), "no zero address");
        tokenAddress = _token;
    }

    function addLiquidity(uint256 _tokenAmount) public payable returns(uint256) {
        if(getReserve() == 0) {
            IERC20 token = IERC20(tokenAddress);
            token.transferFrom(msg.sender, address(this), _tokenAmount);

            uint256 liquidity = address(this).balance;
            _mint(msg.sender, liquidity);

            return liquidity;
        } else {
            uint256 tokenReserve = getReserve();
            uint256 ethReserve = address(this).balance - msg.value;
            uint256 tokenAmount = (msg.value * tokenReserve) / ethReserve;
            // 目标：让用户添加 LP 时，TOKEN 价格不会降低
            // This will preserve a price when liquidity is added to a pool.
            // 例如原有 1000 ETH = 2000 TOKEN
            // 用户添加了 500 个 ETH 和 t 个 TOKEN，则按照原来的比例
            // t 必须 >= (500*2000)/1000 = 1000
            // 否则 revert 操作
            require(_tokenAmount >= tokenAmount, "insufficient token amount");
            
            IERC20 token = IERC20(tokenAddress);
            token.transferFrom(msg.sender, address(this), _tokenAmount); 

            uint256 liquidity = (totalSupply() * msg.value) / ethReserve;
            _mint(msg.sender, liquidity);

            return liquidity;
        }
    }

    function getReserve() public view returns(uint256) {
        IERC20 token = IERC20(tokenAddress);
        return token.balanceOf(address(this));
    }

    //    x   *   y    = k
    //   ETH  * TOKEN  = CONSTANT
    // (x+dx) * (y-dy) = CONSTANT
    function getAmount(
        uint256 inputAmount,  // 将要增加的东西(ETH -> token 时为 ETH, token -> ETH 时为 token)的数量 (dx)
        uint256 inputReserve, // 增加的一方的储备 (x)
        uint256 outputReserve // 减少的一方的储备 (y)
    ) private pure returns (uint256) {
        require(inputReserve > 0 && outputReserve > 0, "invalid reserves");
        // UPDATE: 添加手续费 1%，为避开浮点数运算，分子分母同时扩大100倍
        uint256 inputAmountWithFee = inputAmount * 99;
        uint256 numerator = inputAmountWithFee * outputReserve;
        // return (inputAmount * outputReserve) / (inputReserve + inputAmount); // 减少的东西 (dy)
        uint256 denominator = (inputReserve * 100) + inputAmountWithFee;

        return numerator / denominator;
    }

    function getTokenAmount(uint256 _ethSold) public view returns(uint256) { // 用 ETH 买到多少 token
        require(_ethSold > 0, "ethSold > 0 is required");

        uint256 tokenReserve = getReserve();
        return getAmount(_ethSold, address(this).balance, tokenReserve);
    }

    function getEthAmount(uint _tokenSold) public view returns(uint256) { // 卖 token 得到多少 ETH
        require(_tokenSold > 0, "ethSold > 0 is required"); 
        uint256 tokenReserve = getReserve();
        return getAmount(_tokenSold, tokenReserve, address(this).balance);
    }

    function ethToTokenSwap(uint256 _minTokens) public payable { // _minTokens: 用户可以接受换来的最少的 token
        uint256 tokenReserve = getReserve();
        uint256 tokensBought = getAmount(
            msg.value,
            address(this).balance - msg.value, // 调用函数时，ETH 已经发送到合约里，要减掉
            tokenReserve
        );
        require(tokensBought >= _minTokens, "insufficient output amount");

        IERC20(tokenAddress).transfer(msg.sender, tokensBought);
    }

    function tokenToEthSwap(uint256 _tokensSold, uint256 _minEth) public {
        uint256 tokenReserve = getReserve();
        // uint256 tokenAllowance = IERC20(tokenAddress).allowance(msg.sender, address(this));
        // require(tokenAllowance >= _tokensSold, "transferrable amount is smaller than required");
        uint256 ethBought = getAmount(
            _tokensSold,
            tokenReserve,
            address(this).balance
        );
        require(ethBought >= _minEth, "insufficient output amount");
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), _tokensSold);
        payable(msg.sender).transfer(ethBought); // "send" and "transfer" are only available for objects of type "address payable"
    }

    function removeLiquidity(uint256 _amount) public returns(uint256, uint256) {
        require(_amount > 0, "invalid amount");

        uint256 ethAmount = (address(this).balance * _amount) / totalSupply();
        uint256 tokenAmount = (getReserve() * _amount) / totalSupply();

        _burn(msg.sender, _amount);
        payable(msg.sender).transfer(ethAmount);
        IERC20(tokenAddress).transfer(msg.sender, tokenAmount);
        
        return (ethAmount, tokenAmount);
    }
}