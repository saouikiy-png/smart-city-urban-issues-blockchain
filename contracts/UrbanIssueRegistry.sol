// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract UrbanIssueRegistry is AccessControl {
    bytes32 public constant MUNICIPAL_ROLE = keccak256("MUNICIPAL_ROLE");
    uint256 public constant MAX_BATCH = 15;
    uint256 public constant MAX_ISSUE_ID_LENGTH = 64;
    uint256 public constant MAX_ISSUE_TYPE_LENGTH = 64;
    uint256 public constant MAX_LOCATION_LENGTH = 200;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 500;
    uint256 public constant MAX_REPORT_DATE_LENGTH = 10;
    uint256 public constant MAX_REPORTED_BY_LENGTH = 64;
    uint256 public constant MAX_TEAM_LENGTH = 64;
    uint256 public constant MAX_COMMENT_LENGTH = 300;

    enum Status {
        Reported,
        Assigned,
        InProgress,
        Resolved,
        Closed
    }

    enum Priority {
        Low,
        Medium,
        High,
        Critical
    }

    struct Issue {
        uint256 id;
        string issueId;
        string issueType;
        string location;
        string description;
        string reportDate;
        Priority priority;
        string reportedBy;
        address reporter;
        string assignedTo;
        Status status;
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct HistoryEntry {
        uint256 timestamp;
        Status status;
        string team;
        string comment;
        address actor;
    }

    uint256 private _totalIssues;
    mapping(uint256 id => Issue issue) private _issues;
    mapping(uint256 id => HistoryEntry[] entries) private _history;
    mapping(bytes32 issueIdHash => uint256 id) private _idByRef;

    error IssueNotFound(uint256 id);
    error IssueRefNotFound(string issueId);
    error DuplicateIssueId(string issueId);
    error InvalidArrayLengths();
    error EmptyBatch();
    error BatchTooLarge(uint256 supplied, uint256 maximum);
    error EmptyRequiredField(bytes32 field);
    error StringTooLong(bytes32 field, uint256 supplied, uint256 maximum);
    error InvalidReportDate();
    error InvalidComment();
    error InvalidStatusTransition(Status currentStatus, Status requestedStatus);

    event IssueCreated(uint256 indexed id, string issueId, address indexed reporter);
    event IssueAssigned(uint256 indexed id, string team, address indexed actor);
    event StatusUpdated(
        uint256 indexed id,
        Status oldStatus,
        Status newStatus,
        address indexed actor,
        string comment
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MUNICIPAL_ROLE, msg.sender);
    }

    function createIssue(
        string calldata issueId,
        string calldata issueType,
        string calldata location,
        string calldata description,
        string calldata reportDate,
        Priority priority,
        string calldata reportedBy
    ) external returns (uint256 id) {
        id = _createIssue(issueId, issueType, location, description, reportDate, priority, reportedBy);
    }

    function batchCreateIssues(
        string[] calldata issueIds,
        string[] calldata issueTypes,
        string[] calldata locations,
        string[] calldata descriptions,
        string[] calldata reportDates,
        Priority[] calldata priorities,
        string[] calldata reportedBys,
        string[] calldata assignedTos
    ) external onlyRole(MUNICIPAL_ROLE) {
        uint256 length = issueIds.length;
        if (
            issueTypes.length != length ||
            locations.length != length ||
            descriptions.length != length ||
            reportDates.length != length ||
            priorities.length != length ||
            reportedBys.length != length ||
            assignedTos.length != length
        ) revert InvalidArrayLengths();
        if (length == 0) revert EmptyBatch();
        if (length > MAX_BATCH) revert BatchTooLarge(length, MAX_BATCH);

        for (uint256 i = 0; i < length; i++) {
            uint256 id = _createIssue(
                issueIds[i],
                issueTypes[i],
                locations[i],
                descriptions[i],
                reportDates[i],
                priorities[i],
                reportedBys[i]
            );
            if (bytes(assignedTos[i]).length > 0) {
                _assignIssue(id, assignedTos[i], "");
            }
        }
    }

    function assignIssue(uint256 id, string calldata team, string calldata comment)
        external
        onlyRole(MUNICIPAL_ROLE)
    {
        Issue storage issue = _requireIssue(id);
        if (issue.status != Status.Reported && issue.status != Status.Assigned) {
            revert InvalidStatusTransition(issue.status, Status.Assigned);
        }
        _validateComment(comment);
        _assignIssue(id, team, comment);
    }

    function updateStatus(uint256 id, Status newStatus, string calldata comment)
        external
        onlyRole(MUNICIPAL_ROLE)
    {
        Issue storage issue = _requireIssue(id);
        _validateComment(comment);
        if (
            issue.status == Status.Closed ||
            uint8(newStatus) != uint8(issue.status) + 1
        ) revert InvalidStatusTransition(issue.status, newStatus);

        Status oldStatus = issue.status;
        issue.status = newStatus;
        issue.updatedAt = block.timestamp;
        _history[id].push(HistoryEntry({
            timestamp: block.timestamp,
            status: newStatus,
            team: issue.assignedTo,
            comment: comment,
            actor: msg.sender
        }));
        emit StatusUpdated(id, oldStatus, newStatus, msg.sender, comment);
    }

    function getIssue(uint256 id) external view returns (Issue memory) {
        return _requireIssue(id);
    }

    function getIssueByRef(string calldata issueId) external view returns (Issue memory) {
        uint256 id = _idByRef[keccak256(bytes(issueId))];
        if (id == 0) revert IssueRefNotFound(issueId);
        return _issues[id];
    }

    function getIdByRef(string calldata issueId) external view returns (uint256) {
        return _idByRef[keccak256(bytes(issueId))];
    }

    function getHistory(uint256 id) external view returns (HistoryEntry[] memory) {
        _requireIssue(id);
        return _history[id];
    }

    function historyLength(uint256 id) external view returns (uint256) {
        _requireIssue(id);
        return _history[id].length;
    }

    function totalIssues() external view returns (uint256) {
        return _totalIssues;
    }

    function _createIssue(
        string calldata issueId,
        string calldata issueType,
        string calldata location,
        string calldata description,
        string calldata reportDate,
        Priority priority,
        string calldata reportedBy
    ) private returns (uint256 id) {
        _validateField(issueId, "issueId", MAX_ISSUE_ID_LENGTH);
        _validateField(issueType, "issueType", MAX_ISSUE_TYPE_LENGTH);
        _validateField(location, "location", MAX_LOCATION_LENGTH);
        _validateField(description, "description", MAX_DESCRIPTION_LENGTH);
        _validateField(reportDate, "reportDate", MAX_REPORT_DATE_LENGTH);
        _validateField(reportedBy, "reportedBy", MAX_REPORTED_BY_LENGTH);
        if (!_isIsoDate(reportDate)) revert InvalidReportDate();

        bytes32 issueIdHash = keccak256(bytes(issueId));
        if (_idByRef[issueIdHash] != 0) revert DuplicateIssueId(issueId);

        id = ++_totalIssues;
        _idByRef[issueIdHash] = id;
        _issues[id] = Issue({
            id: id,
            issueId: issueId,
            issueType: issueType,
            location: location,
            description: description,
            reportDate: reportDate,
            priority: priority,
            reportedBy: reportedBy,
            reporter: msg.sender,
            assignedTo: "",
            status: Status.Reported,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        _history[id].push(HistoryEntry({
            timestamp: block.timestamp,
            status: Status.Reported,
            team: "",
            comment: unicode"Signalement créé",
            actor: msg.sender
        }));
        emit IssueCreated(id, issueId, msg.sender);
    }

    function _assignIssue(uint256 id, string calldata team, string memory comment) private {
        Issue storage issue = _issues[id];
        _validateField(team, "team", MAX_TEAM_LENGTH);
        Status oldStatus = issue.status;
        issue.assignedTo = team;
        issue.status = Status.Assigned;
        issue.updatedAt = block.timestamp;
        _history[id].push(HistoryEntry({
            timestamp: block.timestamp,
            status: Status.Assigned,
            team: team,
            comment: comment,
            actor: msg.sender
        }));
        emit IssueAssigned(id, team, msg.sender);
        emit StatusUpdated(id, oldStatus, Status.Assigned, msg.sender, comment);
    }

    function _requireIssue(uint256 id) private view returns (Issue storage issue) {
        if (id == 0 || id > _totalIssues) revert IssueNotFound(id);
        issue = _issues[id];
    }

    function _validateField(string calldata value, bytes32 field, uint256 maximum) private pure {
        uint256 length = bytes(value).length;
        if (length > maximum) revert StringTooLong(field, length, maximum);
        if (_isBlank(value)) revert EmptyRequiredField(field);
    }

    function _validateComment(string calldata comment) private pure {
        if (bytes(comment).length > MAX_COMMENT_LENGTH) {
            revert StringTooLong("comment", bytes(comment).length, MAX_COMMENT_LENGTH);
        }
        if (_isBlank(comment)) revert InvalidComment();
    }

    function _isBlank(string calldata value) private pure returns (bool) {
        bytes calldata valueBytes = bytes(value);
        for (uint256 i = 0; i < valueBytes.length; i++) {
            bytes1 character = valueBytes[i];
            if (character != 0x20 && character != 0x09 && character != 0x0a && character != 0x0d) {
                return false;
            }
        }
        return true;
    }

    function _isIsoDate(string calldata value) private pure returns (bool) {
        bytes calldata date = bytes(value);
        if (date.length != 10 || date[4] != 0x2d || date[7] != 0x2d) return false;
        for (uint256 i = 0; i < date.length; i++) {
            if (i == 4 || i == 7) continue;
            if (date[i] < 0x30 || date[i] > 0x39) return false;
        }
        return true;
    }
}