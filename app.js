var express = require('express');
var bodyParser = require('body-parser')
var qs = require('qs')
var fs = require("fs");

const path = require('path');
const gm = require('gm').subClass({ imageMagick: 'true' });
var app = express();

// 似乎gm无法直接处理base64编码的图片，所以先将图片保存到本地，然后再用gm处理
let basePath = `F:/7KaCode/pdc-mgmt-bg/raw-img/`
var tempPath

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


  // let resData = []
  getBase64Img(filePathList)
    .then(() => {
      // 先从本地读个图片！
      let filePath = path.resolve(tempPath);
      let finalImg = fs.readFileSync(filePath); // 例：fileUrl="D:\\test\\test.bmp"
      let finalImgBase64 = finalImg.toString("base64");
      return finalImgBase64
    })
    .then(data => {
      // 用Promise包装了一下baidubce接口，异步获取数据（感谢heinze）
      getBaidubceInfo({ image: data })
        .then(result => {
          let parsedData = JSON.parse(result)
          return [parsedData]
        })
        .then(data => {
          // 将识图结果作为/images接口返回数据
          let wordsList = dealResData(data)
          res.status(200),
            res.send({
              'data': {
                instanceName: content.instanceName,
                statisticalTime: content.statisticalTime,
                statisticalPeriod: content.statisticalPeriod,
                phoneType: content.phoneType,
                content: wordsList
              }
            })
        })
    }, err => {
      console.log(err)
      res.send({ 'err': err })
    })

});

//配置服务端口
let server = app.listen(3000, function () {
  let host = server.address().address;
  let port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
})


const getBase64Img = (data) => {
  return new Promise((resolve, reject) => {
    // 这里试一下gm的拼图
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

const getBaidubceInfo = (content) => {
  return new Promise((resolve, reject) => {
    let opt = {
      host: 'aip.baidubce.com',
      // port: 80, //It sounds like you are trying to use port 80 for https?:)
      method: 'POST',
      path: '/rest/2.0/ocr/v1/accurate_basic?access_token=24.683b4642a86b3901a2ce9bbbed7a15a8.2592000.1576760951.282335-17808912',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // 'Content-Length': Buffer.byteLength(postData)
      }
    }
    let https = require('https');
    let req = https.request(opt, function (res) {
      // console.log(`状态码: ${res.statusCode}`);
      // console.log(`响应头: ${JSON.stringify(res.headers)}`);

      res.on('data', function (data) {
        // console.log("Response:");

        // 不知道为什么一定要先console.log一遍data，JSON.parse才能正常运行
        // 否则可能会突然报错Unexpected end of JSON input
        // 虽然我觉得和console.log木有关系
        console.log('data:')
        console.log(data)
        // let resData = JSON.parse(data)
        let resData = data.toString()
        console.log('resData:');
        console.log(resData);
        resolve(resData)
      });
    });

    req.on('error', function (e) {
      console.log("ERROR:");
      console.log(e);
    });

    req.write(qs.stringify(content));
    req.end();
  })
}

// 处理百度图片识别的接口数据
// 改为使用腾讯爸爸的OCR接口，所以数据要重新处理
const uselessCharacter = '族长, 副族长, 长老, 豪杰, 精英, 族员, 新人';

const dealResData = (data) => {
  // console.log('data:')
  // console.log(data)
  // 先过滤一遍，把没有识图结果（words_result）的项过滤掉
  let baseData1 = data.filter(item => item.words_result)
  // console.log('baseData1:')
  // console.log(baseData1)
  // 针对数组每一项（对象），只需要words_result属性的值即可
  let baseData2 = baseData1.map(item => item.words_result)
  // console.log('baseData2:')
  // console.log(baseData2)
  // 用reduce方法将所有的对象数组合并，此时数组每一项为{words: 'xxx'}；然后用filter将“族长豪杰精英”等文本去掉
  let baseData3 = baseData2.reduce((prev, cur) => [...prev, ...cur]).filter(item => uselessCharacter.indexOf(item.words) <= -1)
  // let baseData3 = baseData2.filter(item => uselessCharacter.indexOf(item.words) <= -1)
  // 此时数组内容应该是成双成对的，step=2遍历，格式化为[{name: 'xxx', score: '123'}, {name: 'xxx', score: '123'}]
  console.log('baseData3:')
  console.log(baseData3)
  let wordList = []
  for (let i = 0; i < baseData3.length; i += 2) {
    // name的识别结果，有些会有空格，去一下空格
    baseData3[i].words = baseData3[i].words.replace(/\s+/g, '');
    // push的时候顺便去重
    if (!(wordList.some(item => item.name === baseData3[i].words)))
      wordList.push({ name: baseData3[i].words, score: baseData3[i + 1].words })
  }
  // console.log('wordList:')
  // console.log(wordList)
  return wordList
}
