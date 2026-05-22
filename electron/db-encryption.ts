import Database from 'better-sqlite3'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {
  getSecureKeyManager,
  getMachineFingerprint
} from './secure-key-manager'

/**
 * 数据库加密配置
 * @property DEBUG_MODE_KEY - 调试模式密钥文件路径标记
 * @property KEY_FILE_NAME - 密钥文件名称
 */
const ENCRYPTION_CONFIG = {
  DEBUG_MODE_KEY: '.debug_mode',
  KEY_FILE_NAME: '.db_key'
}

/**
 * 数据库加密管理器
 * 提供数据库加密、解密和密钥管理功能
 */
export class DatabaseEncryption {
  private static instance: DatabaseEncryption
  private encryptionKey: string | null = null
  private isDebugMode: boolean = false

  /**
   * 获取单例实例
   * @returns DatabaseEncryption 实例
   */
  static getInstance(): DatabaseEncryption {
    if (!DatabaseEncryption.instance) {
      DatabaseEncryption.instance = new DatabaseEncryption()
    }
    return DatabaseEncryption.instance
  }

  /**
   * 构造函数
   * 初始化时检测调试模式并加载密钥
   */
  private constructor() {
    this.detectDebugMode()
    this.loadEncryptionKey()
  }

  /**
   * 检测是否为调试模式
   * 调试模式允许访问加密数据库
   * @returns boolean 是否为调试模式
   */
  private detectDebugMode(): boolean {
    // 方式1: 检查环境变量
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      this.isDebugMode = true
      return true
    }

    // 方式2: 检查调试标记文件（存在于开发目录）
    const debugMarkerPath = path.join(process.cwd(), ENCRYPTION_CONFIG.DEBUG_MODE_KEY)
    if (fs.existsSync(debugMarkerPath)) {
      this.isDebugMode = true
      return true
    }

    // 方式3: 检查是否在 Electron 开发模式
    if (process.env.ELECTRON_IS_DEV === 'true') {
      this.isDebugMode = true
      return true
    }

    this.isDebugMode = false
    return false
  }

  /**
   * 加载加密密钥
   * 优先级: 机器派生密钥 > 密钥文件（仅调试模式）
   * 生产环境使用机器指纹派生的密钥，确保数据库绑定到特定机器
   */
  private loadEncryptionKey(): void {
    try {
      // 优先级1: 机器派生密钥（生产环境使用）
      // 基于机器硬件信息（CPU、MAC地址等）派生唯一密钥
      const machineKey = getMachineDerivedKey()
      if (machineKey) {
        this.encryptionKey = machineKey
        console.log('[DB Encryption] 已使用机器指纹派生密钥')
        return
      }
    } catch (error) {
      console.warn('[DB Encryption] 机器派生密钥失败:', error)
    }

    // 优先级2: 密钥文件（仅调试模式，用于开发测试）
    if (this.isDebugMode) {
      const keyFilePath = path.join(process.cwd(), ENCRYPTION_CONFIG.KEY_FILE_NAME)
      if (fs.existsSync(keyFilePath)) {
        try {
          const keyData = fs.readFileSync(keyFilePath, 'utf-8').trim()
          if (keyData) {
            this.encryptionKey = keyData
            console.log('[DB Encryption] 已从密钥文件加载密钥（调试模式）')
            return
          }
        } catch (error) {
          console.warn('[DB Encryption] 读取密钥文件失败:', error)
        }
      }

      // 调试模式下生成临时密钥
      console.warn('[DB Encryption] 调试模式：生成临时密钥')
      this.encryptionKey = crypto.randomBytes(32).toString('base64')
    } else {
      // 生产环境无法获取密钥时抛出错误
      throw new Error('无法加载加密密钥：机器派生失败且非调试模式')
    }
  }

  /**
   * 获取当前加密密钥
   * @returns string | null 加密密钥，非调试模式返回 null
   */
  getEncryptionKey(): string | null {
    if (!this.isDebugMode) {
      console.warn('[DB Encryption] 非调试模式，无法获取密钥')
      return null
    }
    return this.encryptionKey
  }

  /**
   * 检查是否为调试模式
   * @returns boolean 是否为调试模式
   */
  checkDebugMode(): boolean {
    return this.isDebugMode
  }

  /**
   * 获取机器指纹信息
   * @returns MachineFingerprint | null 机器指纹信息
   */
  getMachineFingerprint() {
    return getMachineFingerprint()
  }

  /**
   * 创建加密数据库连接
   * @param dbPath - 数据库文件路径
   * @returns Database | null 加密数据库实例，失败返回 null
   */
  createEncryptedDatabase(dbPath: string): Database.Database | null {
    try {
      // 确保目录存在
      const dbDir = path.dirname(dbPath)
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
      }

      // 创建数据库连接（使用 SQLCipher 加密）
      const db = new Database(dbPath, {
        verbose: this.isDebugMode ? console.log : undefined
      })

      // 启用加密
      if (this.encryptionKey) {
        // 使用 SQLCipher 的 PRAGMA 命令设置密钥
        db.pragma(`key = '${this.encryptionKey}'`)

        // 验证加密是否成功
        try {
          db.prepare('SELECT count(*) FROM sqlite_master').get()
          console.log('[DB Encryption] 数据库加密成功:', dbPath)
        } catch (error) {
          // 如果验证失败，可能是新数据库，需要重新加密
          console.log('[DB Encryption] 初始化新加密数据库:', dbPath)
        }
      }

      return db
    } catch (error) {
      console.error('[DB Encryption] 创建加密数据库失败:', error)
      return null
    }
  }

  /**
   * 打开已加密的数据库
   * @param dbPath - 数据库文件路径
   * @returns Database | null 数据库实例，失败返回 null
   */
  openEncryptedDatabase(dbPath: string): Database.Database | null {
    if (!this.isDebugMode) {
      console.error('[DB Encryption] 非调试模式无法打开加密数据库')
      return null
    }

    if (!fs.existsSync(dbPath)) {
      console.error('[DB Encryption] 数据库文件不存在:', dbPath)
      return null
    }

    try {
      const db = new Database(dbPath, {
        verbose: this.isDebugMode ? console.log : undefined,
        readonly: false
      })

      // 设置解密密钥
      if (this.encryptionKey) {
        db.pragma(`key = '${this.encryptionKey}'`)

        // 验证密钥是否正确
        try {
          db.prepare('SELECT count(*) FROM sqlite_master').get()
          console.log('[DB Encryption] 数据库解密成功:', dbPath)
          return db
        } catch (error) {
          console.error('[DB Encryption] 数据库密钥错误:', error)
          db.close()
          return null
        }
      }

      return db
    } catch (error) {
      console.error('[DB Encryption] 打开加密数据库失败:', error)
      return null
    }
  }

  /**
   * 更改数据库密钥
   * @param dbPath - 数据库文件路径
   * @param newKey - 新密钥
   * @returns boolean 是否成功
   */
  rekeyDatabase(dbPath: string, newKey: string): boolean {
    if (!this.isDebugMode) {
      console.error('[DB Encryption] 非调试模式无法更改密钥')
      return false
    }

    const db = this.openEncryptedDatabase(dbPath)
    if (!db) {
      return false
    }

    try {
      // 使用 REKEY 命令更改密钥
      db.pragma(`rekey = '${newKey}'`)
      console.log('[DB Encryption] 数据库密钥已更改')
      db.close()
      return true
    } catch (error) {
      console.error('[DB Encryption] 更改密钥失败:', error)
      db.close()
      return false
    }
  }

  /**
   * 解密数据库到明文文件
   * @param encryptedDbPath - 加密数据库路径
   * @param plainDbPath - 输出明文数据库路径
   * @returns boolean 是否成功
   */
  decryptDatabase(encryptedDbPath: string, plainDbPath: string): boolean {
    if (!this.isDebugMode) {
      console.error('[DB Encryption] 非调试模式无法解密数据库')
      return false
    }

    const db = this.openEncryptedDatabase(encryptedDbPath)
    if (!db) {
      return false
    }

    try {
      // 使用 SQLite 的备份功能导出明文数据库
      db.exec(`VACUUM INTO '${plainDbPath}'`)
      console.log('[DB Encryption] 数据库已解密到:', plainDbPath)
      db.close()
      return true
    } catch (error) {
      console.error('[DB Encryption] 解密数据库失败:', error)
      db.close()
      return false
    }
  }

  /**
   * 加密明文数据库
   * @param plainDbPath - 明文数据库路径
   * @param encryptedDbPath - 输出加密数据库路径
   * @returns boolean 是否成功
   */
  encryptPlainDatabase(plainDbPath: string, encryptedDbPath: string): boolean {
    if (!fs.existsSync(plainDbPath)) {
      console.error('[DB Encryption] 明文数据库不存在:', plainDbPath)
      return false
    }

    try {
      // 创建新的加密数据库
      const db = this.createEncryptedDatabase(encryptedDbPath)
      if (!db) {
        return false
      }

      // 附加明文数据库并复制数据
      db.exec(`ATTACH DATABASE '${plainDbPath}' AS plaintext KEY ''`)
      db.exec(`SELECT sqlcipher_export('main')`)
      db.exec(`DETACH DATABASE plaintext`)

      console.log('[DB Encryption] 数据库已加密到:', encryptedDbPath)
      db.close()
      return true
    } catch (error) {
      console.error('[DB Encryption] 加密数据库失败:', error)
      return false
    }
  }

  /**
   * 生成随机密钥
   * @param length - 密钥长度，默认 32
   * @returns string 随机密钥
   */
  generateRandomKey(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64')
  }

  /**
   * 保存密钥到文件（仅调试模式）
   * @param key - 要保存的密钥
   * @param keyFilePath - 密钥文件路径，可选
   * @returns boolean 是否成功
   */
  saveKeyToFile(key: string, keyFilePath?: string): boolean {
    if (!this.isDebugMode) {
      console.error('[DB Encryption] 非调试模式无法保存密钥')
      return false
    }

    const targetPath = keyFilePath || path.join(process.cwd(), ENCRYPTION_CONFIG.KEY_FILE_NAME)

    try {
      fs.writeFileSync(targetPath, key, { mode: 0o600 }) // 设置文件权限为仅所有者可读写
      console.log('[DB Encryption] 密钥已保存到:', targetPath)
      return true
    } catch (error) {
      console.error('[DB Encryption] 保存密钥失败:', error)
      return false
    }
  }
}

/**
 * 获取数据库加密管理器实例的便捷函数
 * @returns DatabaseEncryption 实例
 */
export function getDbEncryption(): DatabaseEncryption {
  return DatabaseEncryption.getInstance()
}

/**
 * 创建加密数据库的便捷函数
 * @param dbPath - 数据库文件路径
 * @returns Database | null 数据库实例
 */
export function createEncryptedDb(dbPath: string): Database.Database | null {
  return getDbEncryption().createEncryptedDatabase(dbPath)
}

/**
 * 打开加密数据库的便捷函数
 * @param dbPath - 数据库文件路径
 * @returns Database | null 数据库实例
 */
export function openEncryptedDb(dbPath: string): Database.Database | null {
  return getDbEncryption().openEncryptedDatabase(dbPath)
}

/**
 * 检查是否为调试模式的便捷函数
 * @returns boolean 是否为调试模式
 */
export function isDebugMode(): boolean {
  return getDbEncryption().checkDebugMode()
}

/**
 * 获取加密密钥的便捷函数
 * @returns string | null 加密密钥
 */
export function getEncryptionKey(): string | null {
  return getDbEncryption().getEncryptionKey()
}

/**
 * 获取机器派生密钥的便捷函数
 * @returns string 机器派生的密钥
 */
export function getMachineDerivedKey(): string {
  return getSecureKeyManager().getKey()
}
