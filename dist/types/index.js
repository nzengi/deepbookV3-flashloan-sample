"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManagementError = exports.FlashLoanError = exports.ArbitrageError = void 0;
class ArbitrageError extends Error {
    constructor(message, code, context) {
        super(message);
        this.code = code;
        this.context = context;
        this.name = "ArbitrageError";
    }
}
exports.ArbitrageError = ArbitrageError;
class FlashLoanError extends Error {
    constructor(message, code, context) {
        super(message);
        this.code = code;
        this.context = context;
        this.name = "FlashLoanError";
    }
}
exports.FlashLoanError = FlashLoanError;
class RiskManagementError extends Error {
    constructor(message, code, context) {
        super(message);
        this.code = code;
        this.context = context;
        this.name = "RiskManagementError";
    }
}
exports.RiskManagementError = RiskManagementError;
//# sourceMappingURL=index.js.map