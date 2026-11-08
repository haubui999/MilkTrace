// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VinamilkTrace {
    // ----------------- KHAI BÁO TRẠNG THÁI -----------------
    enum BatchStatus { Created, Checked, Approved, Distributed }

    // ----------------- CẤU TRÚC DỮ LIỆU -----------------
    struct MilkBatch {
        uint256 id;
        string name;
        string productionDate;
        string factory;
        string ipfsHash;
        BatchStatus status;
    }

    mapping(uint256 => MilkBatch) public batches;
    uint256 public batchCount;

    address public owner;
    address public qualityLab;

    // ----------------- SỰ KIỆN -----------------
    event BatchCreated(uint256 indexed id, string name, string factory);
    event StatusUpdated(uint256 indexed id, BatchStatus newStatus, string note);

    // ----------------- KHỞI TẠO -----------------
    constructor() {
        owner = msg.sender;       // Gán bạn là Chủ sở hữu
        qualityLab = msg.sender;  // Gán luôn bạn là Phòng kiểm định (Đường tắt)
    }

    // ----------------- PHÂN QUYỀN -----------------
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: only owner");
        _;
    }

    modifier onlyQualityLab() {
        require(msg.sender == qualityLab, "Not authorized: only quality lab");
        _;
    }

    function setQualityLab(address _lab) public onlyOwner {
        qualityLab = _lab;
    }

    // ----------------- HÀM TẠO LÔ SỮA -----------------
    function createBatch(
        string memory _name,
        string memory _productionDate,
        string memory _factory,
        string memory _ipfsHash
    ) public onlyOwner {
        batchCount++;
        batches[batchCount] = MilkBatch({
            id: batchCount,
            name: _name,
            productionDate: _productionDate,
            factory: _factory,
            ipfsHash: _ipfsHash,
            status: BatchStatus.Created
        });
        emit BatchCreated(batchCount, _name, _factory);
    }

    // ----------------- HÀM CẬP NHẬT TRẠNG THÁI -----------------
    function updateStatus(uint256 _id, BatchStatus _newStatus, string memory _note)
        public
        onlyQualityLab
    {
        require(_id > 0 && _id <= batchCount, "Invalid batch ID");
        batches[_id].status = _newStatus;
        emit StatusUpdated(_id, _newStatus, _note);
    }

    // ----------------- HÀM XEM THÔNG TIN -----------------
    function getBatch(uint256 _id) public view returns (MilkBatch memory) {
        require(_id > 0 && _id <= batchCount, "Invalid ID");
        return batches[_id];
    }
}