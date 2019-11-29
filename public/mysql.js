/**
 * 对数据库连接、insert、select操作进行封装
 * 对外提供3个查询函数
 * 1 - insert
 * 2 - query
 * 3 - freeQuery(查询语句寄几拼，特别自由)
 */
const mysql = require('mysql')
// 自己写的模块
const dbConfig = require('../private/db-config')


// 数据库配置信息
let config = {
  host: dbConfig.ip,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database
}

// 创建数据库连接池
let pool = mysql.createPool(config)


// 建立数据库连接
// let client = mysql.createConnection(config)
// 滴！~牵线成功
// client.connect();

/**
 * 封装插入-INSERT操作
 * @param {string}} tableName 
 * @param {object} data 字段-值的键值对。注意，只支持字符串类型的值
 * @return {object} 根据insert结果，返回相应的对象{status: '', msg: ''}
 */
let insert = (tableName, data) => {
  return new Promise((resolve, reject) => {
    let fields = '', values = '', sql, cb;
    for (let k in data) {
      fields += k + ',';
      values = `${values}'${data[k]}',`
    }
    // 将最后一个逗号删掉
    fields = fields.slice(0, -1);
    values = values.slice(0, -1);
    sql = `INSERT INTO ${tableName}(${fields}) VALUES(${values})`;
    cb = (err, result) => {
      // 调用失败
      if (err) {
        console.log(`---------------------INSERT INTO ${tableName}-------------------`);
        console.log('[TIME]        - ', new Date())
        console.log('[INSERT SQL]  - ', err.sql)
        console.log('[ERR MESSAGE] - ', err.message)
        console.log('-----------------------------------------------------------------\n');
        reject({ status: 'false', msg: err.message })
      }
      // 调用成功
      console.log(`---------------------INSERT INTO ${tableName}-------------------`);
      console.log('[TIME]    - ', new Date())
      // console.log('[MESSAGE] - ', JSON.parse(JSON.stringify(result)))
      console.log('[MESSAGE] - ', result)
      console.log('-----------------------------------------------------------------\n');
      resolve({ status: 'true', msg: 'successful' })
    }
    pool.getConnection((err, conn) => {
      // 初始化数据库连接失败
      if (err) {
        console.log(`---------------------GET POOL CONNECTION FAIL-------------------`);
        console.log('[TIME]        - ', new Date())
        console.log('[ERR MESSAGE] - ', err)
        console.log('-----------------------------------------------------------------\n');
        reject({ status: 'false', msg: '初始化数据库连接失败' })
      }
      conn.query(sql, (err, result) => {
        // 释放连接到连接池
        conn.release();
        cb(err, result)
      });
    })
  })
}

/**
 * 封装插入-INSERT操作，只是帮你运行sql语句辣
 * @param {string} tableName 传表名只是为了输出log
 * @param {string} sql 
 * @return {object} 根据insert结果，返回相应的对象{status: '', msg: ''}
 */
let freeInsert = (tableName, sql) => {
  let cb
  cb = (err, result) => {
    // 调用失败
    if (err) {
      console.log(`---------------------INSERT INTO ${tableName}-------------------`);
      console.log('[TIME]        - ', new Date())
      console.log('[INSERT SQL]  - ', err.sql)
      console.log('[ERR MESSAGE] - ', err.message)
      console.log('-----------------------------------------------------------------\n');
      return { status: 'false', msg: err.message }
    }
    // 调用成功
    console.log(`---------------------INSERT INTO ${tableName}-------------------`);
    console.log('[TIME]    - ', new Date())
    // console.log('[MESSAGE] - ', JSON.parse(JSON.stringify(result)))
    console.log('[MESSAGE] - ', result)
    console.log('-----------------------------------------------------------------\n');
    return { status: 'true', msg: 'successful' }
  }
  pool.getConnection((err, conn) => {
    // 初始化数据库连接失败
    if (err) {
      console.log(`---------------------GET POOL CONNECTION FAIL-------------------`);
      console.log('[TIME]        - ', new Date())
      console.log('[ERR MESSAGE] - ', err)
      console.log('-----------------------------------------------------------------\n');
      return { status: 'false', msg: err }
    }
    conn.query(sql, (err, result) => {
      // 释放连接到连接池
      conn.release();
      cb(err, result)
    });
  })
}

/**
 * 封装查询-SELECT操作，只能查询所有字段
 * @param {string} tableName 
 * @param {object} where 字段-值的键值对，用于where子句构造。注意，只支持字符串类型的值，所以【不支持根据ID查询】
 * @return {object} { status: 'true', msg: 'successful', data: parsedResult }，其中，data仅返回符合查询条件的结果数组
 */
let query = (tableName, where) => {
  let sql, cb, whereClause = ''
  if (where) {
    // 如果where有值
    for (let k in where) {
      whereClause += `${k}='${where[k]}' and `;
    }
    whereClause = whereClause.slice(0, -5)
    sql = `SELECT * FROM ${tableName} ${whereClause}`;
  } else {
    // 没有where子句
    sql = `SELECT * FROM ${tableName}`
  }

  cb = (err, result) => {
    // 调用失败
    if (err) {
      console.log(`---------------------SELECT FROM ${tableName}-------------------`);
      console.log('[TIME]        - ', new Date())
      console.log('[SELECT SQL]  - ', err.sql)
      console.log('[ERR MESSAGE] - ', err.message)
      console.log('-----------------------------------------------------------------\n');
      return { status: 'false', msg: err.message }
    }
    // 调用成功
    let parsedResult = JSON.parse(JSON.stringify(result))
    console.log(`---------------------SELECT FROM ${tableName}-------------------`);
    console.log('[TIME]    - ', new Date())
    console.log('[SELECT SQL]  - ', sql)
    console.log('[DATA] - ', JSON.stringify(result))
    console.log('-----------------------------------------------------------------\n');
    return { status: 'true', msg: 'successful', data: parsedResult }
  }
  let msg = pool.getConnection((err, conn) => {
    // 初始化数据库连接失败
    if (err) {
      console.log(`---------------------GET POOL CONNECTION FAIL-------------------`);
      console.log('[TIME]        - ', new Date())
      console.log('[ERR MESSAGE] - ', err)
      console.log('-----------------------------------------------------------------\n');
      return { status: 'false', msg: err }
    }
    conn.query(sql, (err, result) => {
      // 释放连接到连接池
      conn.release();
      cb(err, result)
    });
  })
  return msg
}

/**
 * 封装查询-SELECT操作，只是帮你运行sql语句辣
 * @param {string} tableName 传表名只是为了输出log
 * @param {string} sql 
 * @return {object} { status: 'true', msg: 'successful', data: parsedResult }，其中，data仅返回符合查询条件的结果数组
 */
let freeQuery = (tableName, sql) => {
  return new Promise((resolve, reject) => {
    let cb
    cb = (err, result) => {
      // 调用失败
      if (err) {
        console.log(`---------------------SELECT FROM ${tableName}-------------------`);
        console.log('[TIME]        - ', new Date())
        console.log('[SELECT SQL]  - ', err.sql)
        console.log('[ERR MESSAGE] - ', err.message)
        console.log('-----------------------------------------------------------------\n');
        reject({ status: 'false', msg: err.message })
      }
      // 调用成功
      let parsedResult = JSON.parse(JSON.stringify(result))
      console.log(`---------------------SELECT FROM ${tableName}-------------------`);
      console.log('[TIME]        - ', new Date())
      console.log('[SELECT SQL]  - ', sql)
      console.log('[DATA]        - ', JSON.stringify(result))
      console.log('-----------------------------------------------------------------\n');
      resolve({ status: 'true', msg: 'successful', data: parsedResult })
    }
    pool.getConnection((err, conn) => {
      // 初始化数据库连接失败
      if (err) {
        console.log(`---------------------GET POOL CONNECTION FAIL-------------------`);
        console.log('[TIME]        - ', new Date())
        console.log('[ERR MESSAGE] - ', err)
        console.log('-----------------------------------------------------------------\n');
        reject({ status: 'false', msg: err })
      }
      conn.query(sql, (err, result) => {
        // 释放连接到连接池
        conn.release();
        cb(err, result)
      });
    })
  })
}

module.exports = {
  insert: insert,
  freeInsert: freeInsert,
  query: query,
  freeQuery: freeQuery
}