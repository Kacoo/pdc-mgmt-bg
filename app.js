/**
 * 打算改用腾讯提供的OCR接口识别图片文字
 * 这里保留百度的接口调用
 * 请出门右转app2.js
 */
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

var a = {
  "TextDetections":
    [{
      "DetectedText": "蛋儿的忧桑",
      "Confidence": 99,
      "Polygon": [{ "X": 11, "Y": 4 }, { "X": 12, "Y": 40 }, { "X": 195, "Y": 40 }, { "X": 195, "Y": 4 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":1}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 20, "Y": 81 }, { "X": 20, "Y": 50 }, { "X": 87, "Y": 50 }, { "X": 87, "Y": 82 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":1}}"
    },
    {
      "DetectedText": "逆袭",
      "Confidence": 99,
      "Polygon": [{ "X": 10, "Y": 159 }, { "X": 10, "Y": 122 }, { "X": 85, "Y": 123 }, { "X": 85, "Y": 160 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":2}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 21, "Y": 172 }, { "X": 21, "Y": 205 }, { "X": 87, "Y": 204 }, { "X": 87, "Y": 171 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":3}}"
    },
    {
      "DetectedText": "思念像海",
      "Confidence": 99,
      "Polygon": [{ "X": 11, "Y": 281 }, { "X": 12, "Y": 244 }, { "X": 159, "Y": 246 }, { "X": 159, "Y": 283 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":4}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 20, "Y": 325 }, { "X": 21, "Y": 292 }, { "X": 87, "Y": 293 }, { "X": 86, "Y": 326 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":5}}"
    },
    {
      "DetectedText": "ming",
      "Confidence": 99,
      "Polygon": [{ "X": 7, "Y": 406 }, { "X": 9, "Y": 369 }, { "X": 96, "Y": 373 }, { "X": 94, "Y": 410 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":6}}"
    }, {
      "DetectedText": "副族长",
      "Confidence": 99,
      "Polygon": [{ "X": 21, "Y": 413 }, { "X": 21, "Y": 449 }, { "X": 116, "Y": 449 }, { "X": 115, "Y": 413 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":7}}"
    },
    {
      "DetectedText": "Foredown涨YY",
      "Confidence": 94,
      "Polygon": [{ "X": 9, "Y": 491 }, { "X": 9, "Y": 529 }, { "X": 276, "Y": 527 }, { "X": 276, "Y": 488 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":8}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 22, "Y": 538 }, { "X": 24, "Y": 570 }, { "X": 88, "Y": 566 }, { "X": 86, "Y": 533 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":8}}"
    }, {
      "DetectedText": "哦哟哟好厉害",
      "Confidence": 99,
      "Polygon": [{ "X": 10, "Y": 647 }, { "X": 10, "Y": 610 }, { "X": 231, "Y": 612 }, { "X": 231, "Y": 648 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":9}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 21, "Y": 689 }, { "X": 21, "Y": 657 }, { "X": 87, "Y": 659 }, { "X": 87, "Y": 690 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":9}}"
    }, {
      "DetectedText": "爱是吕梦卿.",
      "Confidence": 96,
      "Polygon": [{ "X": 10, "Y": 769 }, { "X": 10, "Y": 731 }, { "X": 198, "Y": 731 }, { "X": 198, "Y": 769 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":10}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 20, "Y": 812 }, { "X": 20, "Y": 780 }, { "X": 87, "Y": 780 }, { "X": 86, "Y": 812 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":10}}"
    }, {
      "DetectedText": "龍之天",
      "Confidence": 91,
      "Polygon": [{ "X": 8, "Y": 870 }, { "X": 9, "Y": 831 }, { "X": 122, "Y": 835 }, { "X": 121, "Y": 874 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":11}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 20, "Y": 913 }, { "X": 21, "Y": 880 }, { "X": 88, "Y": 882 }, { "X": 87, "Y": 914 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":12}}"
    },
    {
      "DetectedText": "泰勒.斯威夫特",
      "Confidence": 92,
      "Polygon": [{ "X": 10, "Y": 992 }, { "X": 11, "Y": 956 }, { "X": 269, "Y": 956 }, { "X": 269, "Y": 992 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":13}}"
    },
    {
      "DetectedText": "豪杰",
      "Confidence": 99,
      "Polygon": [{ "X": 20, "Y": 1035 }, { "X": 20, "Y": 1002 }, { "X": 87, "Y": 1003 }, { "X": 87, "Y": 1036 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":13}}"
    }, {
      "DetectedText": "宇智波带土",
      "Confidence": 96,
      "Polygon": [{ "X": 10, "Y": 1078 }, { "X": 10, "Y": 1114 }, { "X": 195, "Y": 1112 }, { "X": 195, "Y": 1076 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":14}}"
    },
    {
      "DetectedText": "新人",
      "Confidence": 99,
      "Polygon": [{ "X": 21, "Y": 1157 }, { "X": 21, "Y": 1125 }, { "X": 88, "Y": 1125 }, { "X": 88, "Y": 1158 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":14}}"
    },
    {
      "DetectedText": "民咕咕",
      "Confidence": 99,
      "Polygon": [{ "X": 12, "Y": 1197 }, { "X": 12, "Y": 1235 }, { "X": 119, "Y": 1235 }, { "X": 119, "Y": 1196 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":15}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 21, "Y": 1278 }, { "X": 21, "Y": 1246 }, { "X": 87, "Y": 1247 }, { "X": 87, "Y": 1278 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":16}}"
    },
    {
      "DetectedText": "给大佬倒橙汁",
      "Confidence": 99,
      "Polygon": [{ "X": 9, "Y": 1320 }, { "X": 9, "Y": 1359 }, { "X": 231, "Y": 1358 }, { "X": 231, "Y": 1320 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":17}}"
    },
    {
      "DetectedText": "豪杰",
      "Confidence": 99,
      "Polygon": [{ "X": 23, "Y": 1399 }, { "X": 23, "Y": 1368 }, { "X": 86, "Y": 1368 }, { "X": 86, "Y": 1400 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":17}}"
    },
    {
      "DetectedText": "唔顺Q",
      "Confidence": 99,
      "Polygon": [{ "X": 12, "Y": 1443 }, { "X": 12, "Y": 1478 }, { "X": 113, "Y": 1477 }, { "X": 112, "Y": 1442 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":18}}"
    },
    {
      "DetectedText": "族员",
      "Confidence": 99,
      "Polygon": [{ "X": 19, "Y": 1489 }, { "X": 20, "Y": 1522 }, { "X": 87, "Y": 1520 }, { "X": 86, "Y": 1488 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":19}}"
    },
    {
      "DetectedText": "我改名了",
      "Confidence": 99,
      "Polygon": [{ "X": 11, "Y": 1563 }, { "X": 11, "Y": 1599 }, { "X": 154, "Y": 1599 }, { "X": 154, "Y": 1562 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":20}}"
    },
    {
      "DetectedText": "精英",
      "Confidence": 99,
      "Polygon": [{ "X": 22, "Y": 1610 }, { "X": 22, "Y": 1639 }, { "X": 87, "Y": 1639 }, { "X": 87, "Y": 1610 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":21}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 558, "Y": 24 }, { "X": 560, "Y": 65 }, { "X": 621, "Y": 61 }, { "X": 618, "Y": 20 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":22}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 555, "Y": 183 }, { "X": 556, "Y": 143 }, { "X": 620, "Y": 145 }, { "X": 618, "Y": 186 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":23}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 556, "Y": 267 }, { "X": 556, "Y": 306 }, { "X": 620, "Y": 306 }, { "X": 619, "Y": 267 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":24}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 559, "Y": 388 }, { "X": 559, "Y": 427 }, { "X": 619, "Y": 426 }, { "X": 619, "Y": 388 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":25}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 558, "Y": 511 }, { "X": 560, "Y": 549 }, { "X": 621, "Y": 546 }, { "X": 619, "Y": 508 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":26}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 555, "Y": 631 }, { "X": 556, "Y": 672 }, { "X": 620, "Y": 670 }, { "X": 619, "Y": 629 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":27}}"
    },
    {
      "DetectedText": "109",
      "Confidence": 99,
      "Polygon": [{ "X": 559, "Y": 792 }, { "X": 559, "Y": 752 }, { "X": 619, "Y": 752 }, { "X": 619, "Y": 792 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":28}}"
    },
    {
      "DetectedText": "106",
      "Confidence": 99,
      "Polygon": [{ "X": 554, "Y": 892 }, { "X": 556, "Y": 851 }, { "X": 622, "Y": 855 }, { "X": 620, "Y": 896 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":29}}"
    },
    {
      "DetectedText": "106",
      "Confidence": 99,
      "Polygon": [{ "X": 559, "Y": 977 }, { "X": 559, "Y": 1015 }, { "X": 620, "Y": 1014 }, { "X": 620, "Y": 977 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":30}}"
    },
    {
      "DetectedText": "105",
      "Confidence": 99,
      "Polygon": [{ "X": 555, "Y": 1098 }, { "X": 556, "Y": 1139 }, { "X": 621, "Y": 1136 }, { "X": 620, "Y": 1096 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":31}}"
    },
    {
      "DetectedText": "105",
      "Confidence": 99,
      "Polygon": [{ "X": 555, "Y": 1217 }, { "X": 555, "Y": 1260 }, { "X": 621, "Y": 1259 }, { "X": 621, "Y": 1216 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":32}}"
    },
    {
      "DetectedText": "102",
      "Confidence": 99,
      "Polygon": [{ "X": 554, "Y": 1379 }, { "X": 556, "Y": 1337 }, { "X": 621, "Y": 1341 }, { "X": 618, "Y": 1382 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":33}}"
    },
    {
      "DetectedText": "97",
      "Confidence": 99,
      "Polygon": [{ "X": 562, "Y": 1500 }, { "X": 562, "Y": 1463 }, { "X": 612, "Y": 1463 }, { "X": 612, "Y": 1500 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":34}}"
    },
    {
      "DetectedText": "84",
      "Confidence": 99,
      "Polygon": [{ "X": 562, "Y": 1586 }, { "X": 562, "Y": 1620 }, { "X": 614, "Y": 1619 }, { "X": 614, "Y": 1585 }],
      "AdvancedInfo": "{\"Parag\":{\"ParagNo\":35}}"
    }],
  "RequestId": "9eaec55c-1c5b-458b-9fea-a6e4171f2302"
}