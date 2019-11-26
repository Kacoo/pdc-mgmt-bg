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

// 似乎gm无法直接处理base64编码的图片，所以先将图片保存到本地，然后再用gm处理
const basePath = `F:/7KaCode/pdc-mgmt-bg/raw-img/`
let tempPath

// 不知道用来干啥，可能是对post的body数据json化？
app.use(bodyParser.json({ limit: '10mb' })); // 支持10mb的post数据
app.use(bodyParser.urlencoded({ extended: false }));

//设置跨域访问
app.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  // res.header("X-Powered-By", ' 3.2.1');
  res.header("Content-Type", "application/json;charset=utf-8");
  // res.header("Content-Type", "application/x-www-form-urlencoded");
  next();
});

// 写个接口
app.post('/images', function (req, res) {
  let content = req.body
  // console.log(JSON.stringify(content))
  // 坑爹，不知道为什么，一张图片就是string，两张图片就是array(原数据image: ['newImgList']，后台接收时变成image: 'newImgList')
  // 黑雪说是解析的锅，好吧自己处理下（
  let imgList = typeof content.image === 'string' ? [content.image] : content.image
  // 拼接图片的保存地址，不知道怎么给下面用啊啊啊啊啊只能在上面用var先声明一波了
  tempPath = `${basePath}${content.statisticalTime}${content.instanceName}.jpg`
  let filePathList = [] // 用来存放图片的地址
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
      getTencentCloudOrcInfo(data)
        .then(result => {
          let needProcessedData = JSON.parse(result)
          // console.log(needProcessedData)
          let wordList = dealResData(needProcessedData.TextDetections)
          res.send(wordList)
        }, err => {
          console.log(err)
          res.send({ 'err': err })
        })
      // .then(data => {
      //   // 将识图结果作为/images接口返回数据
      //   let wordsList = dealResData(data)
      //   res.status(200),
      //     res.send({
      //       'data': {
      //         instanceName: content.instanceName,
      //         statisticalTime: content.statisticalTime,
      //         statisticalPeriod: content.statisticalPeriod,
      //         phoneType: content.phoneType,
      //         content: wordsList
      //       }
      //     })
      // })
    }, err => {
      console.log(err)
      res.send({ 'err': err })
    })

});

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
      .write(tempPath, function (err) {
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
    const secretId = '(*^▽^*)'
    const secretKey = 'O(∩_∩)O~'

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
      msg: '文字识别结果没有值，或者不是3的倍数',
      data:data
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
  return wordList
}
