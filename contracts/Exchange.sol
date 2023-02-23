pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Exchange {
    address public tokenAddress;
    constructor (address _token) {
        require(_token != address(0), "no zero address");
        tokenAddress = _token;
    }

    function addLiquidity(uint256 _tokenAmount) public payable {
        IERC20 token = IERC20(tokenAddress);
        token.transferFrom(msg.sender, address(this), _tokenAmount);
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
        return (inputAmount * outputReserve) / (inputReserve + inputAmount); // 减少的东西 (dy)
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
}