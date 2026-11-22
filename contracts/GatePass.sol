// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GatePass - Blockchain-Based Hostel Outpass Verification System
/// @author Anika Sharma
/// @notice Students request an outpass, the warden approves it, and the gate guard
///         scans the QR code to mark exit and entry. Every step is saved on the blockchain.
contract GatePass {
    enum Role { None, Admin, Warden, Guard, Student }
    enum Status { Pending, Approved, Rejected, Out, Returned, Cancelled }

    struct Student {
        string name;
        string enrollment;
        string room;
        string parentName;
        bool exists;
    }

    struct Pass {
        uint256 id;
        address student;
        string reason;
        string destination;
        uint256 fromTime;
        uint256 returnBy;
        uint256 requestedAt;
        Status status;
        address warden;
        string wardenNote;
        uint256 decidedAt;
        uint256 exitTime;
        uint256 entryTime;
        address guard;
        bool late;
        bytes32 codeHash; // hash of the secret code inside the QR (to detect fake QR codes)
    }

    address public admin;
    mapping(address => Role) public roles;
    mapping(address => string) public names;
    mapping(address => Student) private students;
    mapping(string => address) public studentByEnrollment;
    address[] private studentList;

    Pass[] private passes; // pass id = index + 1
    mapping(address => uint256[]) private studentPasses;
    mapping(address => uint256) public activePass; // 0 = no active pass

    event UserAdded(address indexed user, Role role, string name);
    event PassRequested(uint256 indexed id, address indexed student);
    event PassApproved(uint256 indexed id, address indexed warden);
    event PassRejected(uint256 indexed id, address indexed warden);
    event PassCancelled(uint256 indexed id);
    event StudentExited(uint256 indexed id, address indexed student, uint256 time);
    event StudentReturned(uint256 indexed id, address indexed student, uint256 time, bool late);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can do this");
        _;
    }

    modifier onlyRole(Role r, string memory err) {
        require(roles[msg.sender] == r, err);
        _;
    }

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Admin;
        names[msg.sender] = "Hostel Admin Office";
    }

    // ---------------- Admin ----------------
    function addWarden(address user, string calldata name) external onlyAdmin {
        _addUser(user, Role.Warden, name);
    }

    function addGuard(address user, string calldata name) external onlyAdmin {
        _addUser(user, Role.Guard, name);
    }

    function addStudent(address user, string calldata name, string calldata enrollment, string calldata room,
        string calldata parentName) external onlyAdmin {
        require(bytes(enrollment).length > 0, "Enrollment number is required");
        require(studentByEnrollment[enrollment] == address(0), "Enrollment number already registered");
        _addUser(user, Role.Student, name);
        students[user] = Student(name, enrollment, room, parentName, true);
        studentByEnrollment[enrollment] = user;
        studentList.push(user);
    }

    function _addUser(address user, Role role, string calldata name) private {
        require(user != address(0), "Invalid wallet address");
        require(roles[user] == Role.None, "This wallet is already registered");
        require(bytes(name).length > 0, "Name is required");
        roles[user] = role;
        names[user] = name;
        emit UserAdded(user, role, name);
    }

    // ---------------- Student ----------------
    function requestPass(string calldata reason, string calldata destination, uint256 fromTime, uint256 returnBy,
        bytes32 codeHash) external onlyRole(Role.Student, "Only a registered student can request a pass") {
        require(activePass[msg.sender] == 0, "You already have an active pass");
        require(bytes(reason).length > 0 && bytes(destination).length > 0, "Reason and destination are required");
        require(returnBy > fromTime, "Return time must be after leaving time");
        require(returnBy > block.timestamp, "Return time is already over");

        uint256 id = passes.length + 1;
        Pass storage p = passes.push();
        p.id = id;
        p.student = msg.sender;
        p.reason = reason;
        p.destination = destination;
        p.fromTime = fromTime;
        p.returnBy = returnBy;
        p.requestedAt = block.timestamp;
        p.status = Status.Pending;
        p.codeHash = codeHash;

        studentPasses[msg.sender].push(id);
        activePass[msg.sender] = id;
        emit PassRequested(id, msg.sender);
    }

    function cancelPass(uint256 id) external {
        Pass storage p = _pass(id);
        require(p.student == msg.sender, "Only the student can cancel this pass");
        require(p.status == Status.Pending || p.status == Status.Approved, "This pass cannot be cancelled now");
        p.status = Status.Cancelled;
        activePass[msg.sender] = 0;
        emit PassCancelled(id);
    }

    // ---------------- Warden ----------------
    function approvePass(uint256 id, string calldata note) external onlyRole(Role.Warden, "Only the warden can approve passes") {
        Pass storage p = _pass(id);
        require(p.status == Status.Pending, "Pass is not pending");
        require(block.timestamp < p.returnBy, "Pass time is already over");
        p.status = Status.Approved;
        p.warden = msg.sender;
        p.wardenNote = note;
        p.decidedAt = block.timestamp;
        emit PassApproved(id, msg.sender);
    }

    function rejectPass(uint256 id, string calldata note) external onlyRole(Role.Warden, "Only the warden can reject passes") {
        Pass storage p = _pass(id);
        require(p.status == Status.Pending, "Pass is not pending");
        p.status = Status.Rejected;
        p.warden = msg.sender;
        p.wardenNote = note;
        p.decidedAt = block.timestamp;
        activePass[p.student] = 0;
        emit PassRejected(id, msg.sender);
    }

    // ---------------- Gate Guard ----------------
    function markExit(uint256 id, string calldata code) external onlyRole(Role.Guard, "Only gate security can mark exit") {
        Pass storage p = _pass(id);
        require(keccak256(bytes(code)) == p.codeHash, "Invalid QR code - this may be a fake pass");
        require(p.status != Status.Pending, "Pass is not approved by the warden yet");
        require(p.status != Status.Rejected, "Pass was rejected by the warden");
        require(p.status != Status.Cancelled, "Pass was cancelled");
        require(p.status != Status.Out && p.status != Status.Returned, "Pass already used");
        require(block.timestamp <= p.returnBy, "Pass has expired");
        require(block.timestamp + 1 hours >= p.fromTime, "Too early - pass is not valid yet");
        p.status = Status.Out;
        p.exitTime = block.timestamp;
        p.guard = msg.sender;
        emit StudentExited(id, p.student, block.timestamp);
    }

    function markEntry(uint256 id) external onlyRole(Role.Guard, "Only gate security can mark entry") {
        Pass storage p = _pass(id);
        require(p.status == Status.Out, "Student is not marked as out on this pass");
        p.status = Status.Returned;
        p.entryTime = block.timestamp;
        p.late = block.timestamp > p.returnBy;
        activePass[p.student] = 0;
        emit StudentReturned(id, p.student, block.timestamp, p.late);
    }

    // ---------------- Read functions (free) ----------------
    function _pass(uint256 id) private view returns (Pass storage) {
        require(id > 0 && id <= passes.length, "Pass does not exist");
        return passes[id - 1];
    }

    function passExists(uint256 id) external view returns (bool) {
        return id > 0 && id <= passes.length;
    }

    function getPass(uint256 id) external view returns (Pass memory) {
        return _pass(id);
    }

    function passCount() external view returns (uint256) {
        return passes.length;
    }

    function getStudent(address user) external view returns (Student memory) {
        return students[user];
    }

    function getStudentPasses(address user) external view returns (uint256[] memory) {
        return studentPasses[user];
    }

    function getStudents() external view returns (address[] memory) {
        return studentList;
    }
}
