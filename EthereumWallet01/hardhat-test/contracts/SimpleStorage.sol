// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title SimpleStorage
 * @dev Hardhat으로 컴파일할 수 있는 간단한 스토리지 컨트랙트
 */
contract SimpleStorage {
    uint256 private storedData;
    
    event DataStored(uint256 indexed value, address indexed sender);
    
    /**
     * @dev 숫자를 저장합니다
     * @param x 저장할 숫자
     */
    function set(uint256 x) public {
        storedData = x;
        emit DataStored(x, msg.sender);
    }
    
    /**
     * @dev 저장된 숫자를 조회합니다
     * @return 저장된 숫자
     */
    function get() public view returns (uint256) {
        return storedData;
    }
    
    /**
     * @dev 현재 저장된 값에 숫자를 더합니다
     * @param x 더할 숫자
     */
    function add(uint256 x) public {
        storedData += x;
        emit DataStored(storedData, msg.sender);
    }
    
    /**
     * @dev 저장된 값을 0으로 초기화합니다
     */
    function reset() public {
        storedData = 0;
        emit DataStored(0, msg.sender);
    }
}
