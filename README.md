# lsc-survey-loadtest

## 事前準備

[k6](https://github.com/k6io/k6)が必要です。  
[Installation](https://k6.io/docs/getting-started/installation/)を参考にして導入してください。

## 設定

[サンプルファイル](./config.sample.js)を用意しているので、`./config.js`にコピーした上で、各環境に合わせて設定を変更してください。  
設定の各キーについては、設定ファイルのコメントを参照してください。


## 実行

k6の引数に、`script.k6.js`を渡してください。

```sh
k6 run script.k6.js
```