export default {
    apiGatewayPrefix: "egtedmy1vh",
    surveyId: "730eab34-8282-49b3-96d0-32e2dc04f731",
    calendarStartDay: "20210621",
    calendarEndDay: "20210627",
    targetDay: "20210624",

    edit: 20, // 予約変更する人の割合 | 区間 [0, 100) かつ (edit + cancel) < 100
    cancel: 10, //予約キャンセルする人の割合 | 区間 [0, 100) かつ (edit + cancel) < 100

    verbose: false, // デバッグログ
};

export const options = {
    stages: [
        { duration: "1m", target: 111 },
        { duration: "10m", target: 111 },
        { duration: "1m", target: 0 },
    ],
};