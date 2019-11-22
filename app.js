var express = require('express');
var bodyParser = require('body-parser')
var qs = require('qs')
var app = express();


// 不知道用来干啥，可能是对post的body数据json化？
app.use(bodyParser.json({ limit: '10mb' })); // 支持1mb的post数据
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
  let imgList = content.image

  // 坑爹，不知道为什么，一张图片就是string，两张图片就是array(原数据image: ['newImgList']，后台接收时变成image: 'newImgList')
  // 用Promise包装了一下baidubce接口，异步获取数据（感谢heinze）
  let resData = []
  imgList.map((item, index, arr) => {
    setTimeout(() => {
      getBaidubceInfo({ image: item })
        .then(result => {
          resData.push(result)
        })
        .then(() => {
          if (resData.length === arr.length) {
            // 将识图结果作为/images接口返回数据
            let wordsList = dealResData(resData)
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
          }
        })
    }, 5000)
  })
});

//配置服务端口
let server = app.listen(3000, function () {
  let host = server.address().address;
  let port = server.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
})

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
        console.log(data)
        let resData = JSON.parse(data)
        // console.log(resData);
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

const uselessCharacter = '族长, 副族长, 长老, 豪杰, 精英, 族员, 新人';

const dealResData = (data) => {
  console.log(JSON.stringify(data))
  // 先过滤一遍，把没有识图结果（words_result）的项过滤掉
  let baseData1 = data.filter(item => item.words_result)
  // 针对数组每一项（对象），只需要words_result属性即可
  let baseData2 = baseData1.map(item => item.words_result)
  // 用reduce方法将所有的对象数组合并，此时数组每一项为{words: 'xxx'}；然后用filter将“族长豪杰精英”等文本去掉
  let baseData3 = baseData2.reduce((prev, cur) => [...prev, ...cur]).filter(item => uselessCharacter.indexOf(item.words) <= -1)
  // 此时数组内容应该是成双成对的，step=2遍历，格式化为[{name: 'xxx', score: '123'}, {name: 'xxx', score: '123'}]
  let wordList = []
  for (let i = 0; i < baseData3.length; i += 2) {
    // push的时候顺便去重
    if (!(wordList.some(item => item.name === baseData3[i].words)))
      wordList.push({ name: baseData3[i].words, score: baseData3[i + 1].words })
  }
  return wordList
}
