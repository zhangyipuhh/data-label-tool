import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import os from 'os'

/**
 * 安全密钥管理配置
 * @property SALT_LENGTH - 盐值长度
 * @property KEY_LENGTH - 派生密钥长度
 * @property ITERATIONS - PBKDF2 迭代次数
 * @property DIGEST - 哈希算法
 */
const SECURE_CONFIG = {
  SALT_LENGTH: 32,
  KEY_LENGTH: 32,
  ITERATIONS: 100000,
  DIGEST: 'sha256'
}

/**
 * 机器指纹信息接口
 * @property cpuSerial - CPU 序列号
 * @property macAddress - MAC 地址
 * @property machineId - 机器唯一标识
 * @property systemUUID - 系统 UUID
 */
interface MachineFingerprint {
  cpuInfo: string
  macAddress: string
  machineId: string
  systemUUID: string
  hostname: string
  platform: string
  arch: string
}

/**
 * 安全密钥管理器
 * 提供基于机器指纹的密钥派生，确保数据库只能在特定机器上打开
 */
export class SecureKeyManager {
  private static instance: SecureKeyManager
  private derivedKey: string | null = null
  private machineFingerprint: MachineFingerprint | null = null

  /**
   * 获取单例实例
   * @returns SecureKeyManager 实例
   */
  static getInstance(): SecureKeyManager {
    if (!SecureKeyManager.instance) {
      SecureKeyManager.instance = new SecureKeyManager()
    }
    return SecureKeyManager.instance
  }

  /**
   * 构造函数
   * 初始化时生成机器指纹并派生密钥
   */
  private constructor() {
    this.machineFingerprint = this.generateMachineFingerprint()
    this.derivedKey = this.deriveKeyFromMachine()
  }

  /**
   * 生成机器指纹
   * 收集机器硬件和系统信息作为密钥派生的基础
   * @returns MachineFingerprint 机器指纹信息
   */
  private generateMachineFingerprint(): MachineFingerprint {
    // 获取 CPU 信息
    const cpus = os.cpus()
    const cpuInfo = cpus.length > 0 ? cpus[0].model + cpus.length : 'unknown'

    // 获取 MAC 地址
    const networkInterfaces = os.networkInterfaces()
    let macAddress = ''
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      if (interfaces && !name.includes('Loopback') && !name.includes('lo')) {
        const validInterface = interfaces.find(i => !i.internal && i.mac !== '00:00:00:00:00:00')
        if (validInterface) {
          macAddress = validInterface.mac
          break
        }
      }
    }

    // 生成机器唯一标识（基于多个硬件信息）
    const machineId = crypto
      .createHash('sha256')
      .update(cpuInfo + macAddress + os.hostname())
      .digest('hex')
      .substring(0, 32)

    // 获取或生成系统 UUID
    const systemUUID = this.getOrCreateSystemUUID()

    return {
      cpuInfo,
      macAddress: macAddress || '00:00:00:00:00:00',
      machineId,
      systemUUID,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch()
    }
  }

  /**
   * 获取或创建系统 UUID
   * 用于在机器硬件变化时保持密钥一致性
   * @returns string 系统 UUID
   */
  private getOrCreateSystemUUID(): string {
    const uuidFilePath = this.getUUIDFilePath()

    // 尝试读取已存在的 UUID
    if (fs.existsSync(uuidFilePath)) {
      try {
        const savedUUID = fs.readFileSync(uuidFilePath, 'utf-8').trim()
        if (savedUUID && savedUUID.length === 36) {
          return savedUUID
        }
      } catch (error) {
        console.warn('[SecureKeyManager] 读取 UUID 文件失败:', error)
      }
    }

    // 生成新的 UUID
    const newUUID = crypto.randomUUID()

    // 保存 UUID
    try {
      const dir = path.dirname(uuidFilePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(uuidFilePath, newUUID, { mode: 0o600 })
    } catch (error) {
      console.warn('[SecureKeyManager] 保存 UUID 文件失败:', error)
    }

    return newUUID
  }

  /**
   * 获取 UUID 文件路径
   * @returns string UUID 文件路径
   */
  private getUUIDFilePath(): string {
    if (app && app.getPath) {
      return path.join(app.getPath('userData'), '.system_uuid')
    }
    return path.join(os.homedir(), '.data-label-tool', '.system_uuid')
  }

  /**
   * 从机器指纹派生密钥
   * 使用 PBKDF2 算法生成强密钥
   * @returns string 派生的密钥（Base64 编码）
   */
  private deriveKeyFromMachine(): string {
    if (!this.machineFingerprint) {
      throw new Error('机器指纹未生成')
    }

    // 构建基础字符串（包含多个硬件特征）
    const baseString = [
      this.machineFingerprint.machineId,
      this.machineFingerprint.systemUUID,
      this.machineFingerprint.platform,
      this.machineFingerprint.arch
    ].join('|')

    // 使用固定的盐值（基于机器信息生成，但保持一致性）
    const salt = crypto
      .createHash('sha256')
      .update(this.machineFingerprint.hostname + this.machineFingerprint.macAddress)
      .digest()
      .slice(0, SECURE_CONFIG.SALT_LENGTH)

    // 使用 PBKDF2 派生密钥
    const derivedKey = crypto.pbkdf2Sync(
      baseString,
      salt,
      SECURE_CONFIG.ITERATIONS,
      SECURE_CONFIG.KEY_LENGTH,
      SECURE_CONFIG.DIGEST
    )

    return derivedKey.toString('base64')
  }

  /**
   * 获取派生的密钥
   * @returns string 派生的密钥
   */
  getKey(): string {
    if (!this.derivedKey) {
      throw new Error('密钥未派生')
    }
    return this.derivedKey
  }

  /**
   * 获取机器指纹（用于调试）
   * @returns MachineFingerprint | null 机器指纹信息
   */
  getMachineFingerprint(): MachineFingerprint | null {
    return this.machineFingerprint
  }

  /**
   * 验证当前机器是否匹配指定的机器指纹
   * @param fingerprint - 要验证的机器指纹
   * @returns boolean 是否匹配
   */
  verifyMachine(fingerprint: MachineFingerprint): boolean {
    if (!this.machineFingerprint) {
      return false
    }

    // 主要验证 machineId 和 systemUUID
    return (
      this.machineFingerprint.machineId === fingerprint.machineId &&
      this.machineFingerprint.systemUUID === fingerprint.systemUUID
    )
  }

  /**
   * 生成密钥文件（用于备份或迁移）
   * @param outputPath - 输出文件路径
   * @returns boolean 是否成功
   */
  exportKeyFile(outputPath: string): boolean {
    try {
      const keyData = {
        key: this.derivedKey,
        fingerprint: this.machineFingerprint,
        createdAt: new Date().toISOString(),
        version: '1.0'
      }

      // 加密密钥文件内容
      const encryptedContent = this.encryptKeyFile(JSON.stringify(keyData))
      fs.writeFileSync(outputPath, encryptedContent, { mode: 0o600 })

      console.log('[SecureKeyManager] 密钥文件已导出:', outputPath)
      return true
    } catch (error) {
      console.error('[SecureKeyManager] 导出密钥文件失败:', error)
      return false
    }
  }

  /**
   * 从密钥文件导入（用于恢复或迁移）
   * @param keyFilePath - 密钥文件路径
   * @returns boolean 是否成功
   */
  importKeyFile(keyFilePath: string): boolean {
    try {
      if (!fs.existsSync(keyFilePath)) {
        console.error('[SecureKeyManager] 密钥文件不存在:', keyFilePath)
        return false
      }

      const encryptedContent = fs.readFileSync(keyFilePath, 'utf-8')
      const decryptedContent = this.decryptKeyFile(encryptedContent)
      const keyData = JSON.parse(decryptedContent)

      // 验证机器指纹
      if (keyData.fingerprint && this.verifyMachine(keyData.fingerprint)) {
        this.derivedKey = keyData.key
        console.log('[SecureKeyManager] 密钥文件已导入')
        return true
      } else {
        console.error('[SecureKeyManager] 机器指纹不匹配，无法导入密钥')
        return false
      }
    } catch (error) {
      console.error('[SecureKeyManager] 导入密钥文件失败:', error)
      return false
    }
  }

  /**
   * 加密密钥文件内容
   * @param content - 要加密的内容
   * @returns string 加密后的内容
   */
  private encryptKeyFile(content: string): string {
    // 使用简单的 XOR 加密（仅用于混淆，因为密钥本身已经很强）
    const key = Buffer.from(this.machineFingerprint?.machineId || 'default', 'hex')
    const buffer = Buffer.from(content, 'utf-8')
    const encrypted = Buffer.alloc(buffer.length)

    for (let i = 0; i < buffer.length; i++) {
      encrypted[i] = buffer[i] ^ key[i % key.length]
    }

    return encrypted.toString('base64')
  }

  /**
   * 解密密钥文件内容
   * @param encryptedContent - 加密的内容
   * @returns string 解密后的内容
   */
  private decryptKeyFile(encryptedContent: string): string {
    const key = Buffer.from(this.machineFingerprint?.machineId || 'default', 'hex')
    const buffer = Buffer.from(encryptedContent, 'base64')
    const decrypted = Buffer.alloc(buffer.length)

    for (let i = 0; i < buffer.length; i++) {
      decrypted[i] = buffer[i] ^ key[i % key.length]
    }

    return decrypted.toString('utf-8')
  }

  /**
   * 重新生成密钥（当硬件变化时）
   * 注意：这将导致无法访问旧数据库
   * @returns string 新的密钥
   */
  regenerateKey(): string {
    // 重新生成系统 UUID
    const uuidFilePath = this.getUUIDFilePath()
    if (fs.existsSync(uuidFilePath)) {
      fs.unlinkSync(uuidFilePath)
    }

    // 重新初始化
    this.machineFingerprint = this.generateMachineFingerprint()
    this.derivedKey = this.deriveKeyFromMachine()

    console.warn('[SecureKeyManager] 密钥已重新生成，旧数据库将无法访问')
    return this.derivedKey
  }
}

/**
 * 获取安全密钥管理器实例的便捷函数
 * @returns SecureKeyManager 实例
 */
export function getSecureKeyManager(): SecureKeyManager {
  return SecureKeyManager.getInstance()
}

/**
 * 获取派生密钥的便捷函数
 * @returns string 派生的密钥
 */
export function getMachineDerivedKey(): string {
  return getSecureKeyManager().getKey()
}

/**
 * 获取机器指纹的便捷函数
 * @returns MachineFingerprint | null 机器指纹信息
 */
export function getMachineFingerprint(): MachineFingerprint | null {
  return getSecureKeyManager().getMachineFingerprint()
}
