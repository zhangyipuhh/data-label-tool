/**
 * 自定义签名脚本 - 跳过签名流程
 *
 * 当没有代码签名证书时，electron-builder 仍会为每个 exe 文件调用 signtool.exe，
 * 导致构建过程极其缓慢。此脚本提供一个空操作的自定义签名函数，
 * 让 electron-builder 跳过实际的签名调用，同时保留可执行文件的元数据编辑功能。
 *
 * @param {object} configuration - 签名配置对象，包含待签名文件路径等信息
 * @returns {Promise<void>} - 直接返回，不执行任何签名操作
 */
exports.default = async function(configuration) {
  // 不执行签名操作，直接跳过
}
