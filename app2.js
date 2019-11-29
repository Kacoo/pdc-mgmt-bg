/**
 * 腾讯OCR（Optical Character Recognition，光学字符识别）接口
 * github地址：https://github.com/TencentCloud/tencentcloud-sdk-nodejs
 */
const express = require('express');
const bodyParser = require('body-parser')
const qs = require('qs')
const fs = require("fs");
const tencentcloud = require('tencentcloud-sdk-nodejs') // 好奇怪，前面为啥加那么多../
const path = require('path');
const gm = require('gm').subClass({ imageMagick: 'true' });
const app = express();
// 自己写的模块
const apiKey = require('./private/api-key')
const db = require('./public/mysql')
const publicConfig = require('./public/config')

// 似乎gm无法直接处理base64编码的图片，所以先将图片保存到本地，然后再用gm处理
const basePath = publicConfig.filePath
let tempPath

// 不知道用来干啥，可能是对post的body数据json化？
app.use(bodyParser.json({ limit: '10mb' })); // 支持10mb的post数据
app.use(bodyParser.urlencoded({ extended: false }));

//设置跨域访问
app.all('*', (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  // res.header("X-Powered-By", ' 3.2.1');
  res.header("Content-Type", "application/json;charset=utf-8");
  // res.header("Content-Type", "application/x-www-form-urlencoded");
  next();
});

// 写个接口
app.post('/images', (req, res) => {
  let content = req.body
  // console.log(JSON.stringify(content))
  // 将副本信息录入instance_list
  // 其实只要录一次就行，但是暂时还没办法判断是否重复诶
  let startTime = content.statisticalPeriod.split('至')[0]
  let endTime = content.statisticalPeriod.split('至')[1]
  db.insert('instance_list', {
    instance_name: content.instanceName,
    instance_id: content.instanceId,
    start_time: startTime,
    end_time: endTime,
  })

  // 坑爹，不知道为什么，一张图片就是string，两张图片就是array(原数据image: ['newImgList']，后台接收时变成image: 'newImgList')
  // 黑雪说是解析的锅，好吧自己处理下（
  let imgList = typeof content.image === 'string' ? [content.image] : content.image
  // 拼接图片的保存地址，不知道怎么给下面用啊啊啊啊啊只能在上面用var先声明一波了
  tempPath = `${basePath}${content.statisticalTime}${content.instanceName}.jpg`
  // 用来存放图片的地址
  let filePathList = []
  imgList.map((item, index) => {
    var dataBuffer = new Buffer(item, 'base64');
    // 害，令人窒息的命名方式
    filePathList.push(`${basePath}${content.statisticalTime}${content.instanceName}${index + 1}.jpg`)
    fs.writeFile(filePathList[index], dataBuffer, function (err) {
      if (err) {
        console.log(err)
        // res.send(err);
      }
    });
  })
  console.log(filePathList)

  getBase64Img(filePathList)
    .then(() => {
      // 先从本地读个图片！
      let filePath = path.resolve(tempPath);
      let finalImg = fs.readFileSync(filePath); // 例：fileUrl="D:\\test\\test.bmp"
      let finalImgBase64 = finalImg.toString("base64");
      return finalImgBase64
    })
    .then(data => {
      let sql1 = `SELECT * FROM instance_list WHERE instance_id = ${content.instanceId} AND start_time >= '${startTime}' AND end_time <= '${endTime}'`
      let sql2 = `SELECT np.id, np.name, np.err_name FROM new_players np WHERE np.status = 1`
      // 三个前置条件
      // 1 - 获取文字识别结果
      // 2 - 获取instance_list相应的副本id
      // 3 - 从new_players获取现役的所有族员姓名name, id, err_name
      let p1 = getTencentCloudOrcInfo(data)
      let p2 = db.freeQuery('instance_list', sql1)
      let p3 = db.freeQuery('new_players', sql2)
      return Promise.all([p1, p2, p3])
    })
    .then(results => {
      let needProcessedData = JSON.parse(results[0])
      // console.log(needProcessedData)
      let flag = dealResData(needProcessedData.TextDetections)
      if (flag.status === 'false') {
        res.send(flag)
      }
      let wordList = flag.data
      console.log('wordList', wordList)
      let instanceListId = results[1].data[0].id
      let playerList = results[2].data.map(item => {
        item.err_name = item.err_name ? item.err_name : '';
        return item
      })
      // 将文字识别结果与对应的玩家数据合并
      let rawData = playerList.map((item) => {
        let match = wordList.filter((cur) => cur.name === item.name || item.err_name.indexOf(cur.name) > -1)
        if (match.length) {
          item.score = match[0].score
          return item
        }
        item.score = null
        return item
      })
      // 类似 { id: 5, name: '骑莹—首领拉我', err_name: '骑莹一首领拉我', score: '109' } 的数组
      // console.log(rawData)
      return {
        instanceListId: instanceListId, // 当前周期的副本id
        data: rawData
      }
    })
    // 从数据库中获取现有的副本数据记录
    .then((result) => {
      let sql = `SELECT * FROM instance_detail WHERE instance_list_id = ${result.instanceListId}`
      let p1 = result
      let p2 = db.freeQuery('instance_detail', sql)
      return Promise.all([p1, p2])
    })
    .then(results => {
      let rawData = results[0].data
      let instanceListId = results[0].instanceListId
      // 已存在副本记录中的数据数组
      let existData = results[1].data
      // console.log(existData)

      // 分两个情况
      // 1 - instance_detail不存在该副本的数据，将数据全部insert，不管insert结果，接口返回success
      // 2 - instance_detail已有副本数据，update相关数据
      let rawData2
      if (!existData.length) {
        // 1 - instance_detail不存在该副本的数据，将数据全部insert，不管insert结果，接口返回success
        let insertArr = rawData.map(item => {
          return {
            instanceListId: instanceListId,
            instanceListName: content.instanceName,
            playerId: item.id,
            playerName: item.name,
            score: item.score
          }
        })
        // 一条一条插入数据库，尴尬，暂时不知道成功失败了多少条
        insertArr.map(item => {
          let sql = `INSERT INTO instance_detail(instance_list_id, instance_list_name, player_id, player_name, score) 
          VALUES(${item.instanceListId}, '${item.instanceListName}', ${item.playerId}, '${item.playerName}', ${item.score})`
          db.freeInsert('instance_detail', sql)
        })
      } else {
        // 2 - instance_detail已有副本数据，update相关数据
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // !!!!!!!!注意，这里先不处理新来的族友了，太麻烦了
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // 遍历rawData，如果在existData中存在，则过滤掉
        // 过滤条件：playerId相同 && (existData.score有值 || rawData.score为空)需要被过滤掉
        rawData2 = rawData.filter(item => !(existData.some(cur => cur['player_id'] === item.id && (cur.score || !item.score))))
        console.log(rawData2)
        // 一条一条更新数据库，尴尬，暂时不知道成功失败了多少条
        // 类似 { id: 5, name: '骑莹—首领拉我', err_name: '骑莹一首领拉我', score: '109' } 的数组
        rawData2.map(item => {
          let sql = `UPDATE instance_detail id
                     SET id.score = ${item.score}
                     WHERE id.instance_list_id = ${instanceListId} AND id.player_id = ${item.id}`
          db.freeInsert('instance_detail', sql)
        })
      }
      res.send({ status: 'true', msg: 'successful' })
    }, err => {
      console.log(err)
      res.send({ status: 'false', err: err })
    })
});

// 查询副本情况接口
app.get('/query', (req, res) => {
  console.log(req.query)
  let params = req.query
  let sql = `SELECT * FROM instance_list 
             WHERE instance_id = ${params.instanceId} AND start_time >= '${params.startTime}' AND end_time <= '${params.endTime}'`
  db.freeQuery('instance_list', sql)
    .then((result) => {
      return result.data[0].id
    })
    .then((result) => {
      let sql2 = `SELECT * FROM instance_detail WHERE instance_list_id = ${result} ORDER BY player_id`
      return db.freeQuery('instance_detail', sql2)
    })
    .then((result) => {
      // console.log(result)
      res.send(JSON.parse(JSON.stringify(result)))
    }, (err) => {
      console.log(err)
      res.send({ err: err })
    })
})

//配置服务端口
let server = app.listen(3000, () => {
  let host = server.address().address;
  let port = server.address().port;
  console.log(`Example app listening at http://${host}:${port}`);
})


const getBase64Img = (data) => {
  return new Promise((resolve, reject) => {
    // 拼接图片，从上至下
    gm().append(...data)
      .write(tempPath, (err) => {
        if (!err) {
          console.log('hooray!!!');
          resolve()
        } else {
          console.log('gm拼图报错啦')
          console.log(err)
          reject(err)
        }
      });

  })
}

const getTencentCloudOrcInfo = (content) => {
  return new Promise((resolve, reject) => {
    // 导入对应产品模块的client models。
    const OcrClient = tencentcloud.ocr.v20181119.Client;
    const models = tencentcloud.ocr.v20181119.Models;

    const Credential = tencentcloud.common.Credential;
    const ClientProfile = tencentcloud.common.ClientProfile;

    // secretId & secretKey 需要在腾讯云-控制台-访问密钥-API密钥管理获取
    const secretId = apiKey.secretId
    const secretKey = apiKey.secretKey

    // 实例化一个认证对象，入参需要传入腾讯云账户secretId，secretKey
    let cred = new Credential(secretId, secretKey);

    // 实例化要请求产品的client对象
    let client = new OcrClient(cred, "ap-guangzhou");

    // 实例化一个client选项，可选的，没有特殊需求可以跳过。
    let clientProfile = new ClientProfile();
    clientProfile.signMethod = "TC3-HMAC-SHA256";
    // SignatureMethod

    // 实例化一个请求对象（妈耶，要什么接口还得自己去源码里面找
    let req = new models.GeneralAccurateOCRRequest();
    // 实例化一个请求，然后要填充参数
    req.ImageBase64 = content

    // 通过client对象调用想要访问的接口，需要传入请求对象以及响应回调函数
    client.GeneralAccurateOCR(req, function (err, response) {
      // 请求异常返回，打印异常信息
      if (err) {
        console.log(err);
        reject(err)
        // return;
      }
      // 请求正常返回，打印response对象
      let resData = response.to_json_string()
      // console.log(resData);
      resolve(resData)
    });
  })
}

/**
 * 处理文字识别接口的返回数据
 * 数据格式：对象数组，格式可以出门左转app.js的最后，保存了一份返回样板
 */
const uselessCharacter = '族长, 副族长, 长老, 豪杰, 精英, 族员, 新人';

const dealResData = (data) => {
  // console.log('data: ')
  // console.log(data)
  // 最终处理好的数据存在此处
  let wordList = []
  // 先判断一下数组长度是否为3的倍数，是-继续，否-return
  if (!data.length || data.length % 3 !== 0) {
    // console.log(data)
    return {
      status: 'false',
      msg: '文字识别结果没有值，或者不是3的倍数',
      data: data
    }
  }
  // 将不需要的词汇所在的对象过滤掉（职位名称）
  let baseData1 = data.filter(item => uselessCharacter.indexOf(item.DetectedText) <= -1)
  // 拆分成两个数组，第一个是玩家姓名对象nameList，第二个是副本成绩scoreList
  // 害，有时候会把数字1识别成反斜杠'\'，所以只能用isNaN(+'5\'[0])这种low到爆的方法来过滤
  // 截至2019-11-25，家族没有人的nickname是数字开头的（捂脸
  let step = baseData1.length / 2
  let nameList = baseData1.filter(item => isNaN(+item.DetectedText[0]))
  let scoreList = baseData1.filter(item => !isNaN(+item.DetectedText[0]))
  // console.log(scoreList)
  console.log(`nameList: ${nameList.length}，scoreList: ${scoreList.length}`)
  if (!nameList.length || !scoreList.length) {
    return `nameList: ${nameList.length}，scoreList: ${scoreList.length}`
  }
  for (let i = 0; i < step; i++) {
    wordList.push({
      name: nameList[i].DetectedText,
      score: scoreList[i].DetectedText
    })
  }
  // console.log('wordList: ')
  // console.log(wordList)
  return { status: 'true', data: wordList }
}

