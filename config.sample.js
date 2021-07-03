// 負荷試験のオプション
export default {
    // API GatewayのID
    apiGatewayPrefix: "egtedmy1vh",

    // 帳票のID
    surveyId: "730eab34-8282-49b3-96d0-32e2dc04f731",
    
    // カレンダーの取得開始日
    calendarStartDay: "20210621",
    
    // カレンダーの取得終了日
    calendarEndDay: "20210627",
    
    // カレンダーの負荷試験対象日
    targetDay: "20210624",

    // 予約変更する人の割合
    // 区間 [0, 100) かつ (edit + cancel) < 100
    edit: 20,

    // 予約キャンセルする人の割合
    // 区間 [0, 100) かつ (edit + cancel) < 100
    cancel: 10,

    // デバッグログ出力を有効にする
    verbose: false, 
};

// K6のオプション
// REF: https://k6.io/docs/using-k6/options/
export const options = {
    stages: [
        { duration: "1m", target: 111 },
        { duration: "10m", target: 111 },
        { duration: "1m", target: 0 },
    ],
};