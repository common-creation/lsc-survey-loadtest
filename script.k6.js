// @ts-check

import { check, fail } from "k6";
import http from "k6/http";
import { default as config, options as configOptions } from "./config.js";

const { apiGatewayPrefix, surveyId, calendarStartDay, calendarEndDay, targetDay, edit, cancel, verbose } = config;
const baseUrl = `https://${apiGatewayPrefix}.execute-api.ap-northeast-1.amazonaws.com/Prod/survey/api/v1`;

// ほぼES5.1なのでobjectのspreadは使えない
export const options = Object.assign({}, {
    // scenarios: {
    //     constant_request_rate: {
    //         executor: 'constant-arrival-rate',
    //         rate: 111,
    //         timeUnit: '1s',
    //         duration: '1m',
    //         preAllocatedVUs: 111,
    //         maxVUs: 333,
    //     },
    // },
    thresholds: {
        "http_req_duration{trace:/survey-configs/getItem}": ["max>=0"],
        "http_req_duration{trace:/calendars/item_info/all}": ["max>=0"],
        "http_req_duration{trace:/calendars/info/id}": ["max>=0"],
        "http_req_duration{trace:/calendars/tag_labels}": ["max>=0"],
        "http_req_duration{trace:/calendars/categories_tree}": ["max>=0"],
        "http_req_duration{trace:/calendars/getCalendars}": ["max>=0"],
        "http_req_duration{trace:/calendars/schedule/id}": ["max>=0"],
        "http_req_duration{trace:/survey-results/checkReservation}": ["max>=0"],
        "http_req_duration{trace:/survey-results/putItem_register}": ["max>=0"],
        "http_req_duration{trace:/survey-results/putItem_modify}": ["max>=0"],
        "http_req_duration{trace:/survey-results/filterQuery}": ["max>=0"],
        "http_req_duration{trace:/survey-results/putUserId}": ["max>=0"],
        "http_req_duration{trace:/calendars/categories}": ["max>=0"],
        "http_req_duration{trace:/calendars/item_info/id}": ["max>=0"],
        "http_req_duration{trace:/survey-results/cancelItem}": ["max>=0"],
    },
}, configOptions);

export function setup() {
    console.log("========== setup ==========");
    console.log("apiGatewayPrefix:", apiGatewayPrefix);
    console.log("baseUrl:", baseUrl);
    console.log("surveyId:", surveyId);
    console.log("calendarStartDay:", calendarStartDay);
    console.log("calendarEndDay:", calendarEndDay);
    console.log("targetDay:", targetDay);
    console.log("========== setup ==========");

    const context = {
        users: {},
        rand: {},
    };
    return context;
}

export default function (context) {
    context.rand = Util.XorShift(new Date().getTime() + __VU + __ITER);

    const iterData = {
        dummyUserId: "D" + Math.abs(context.rand.next()).toString(16) + Math.abs(context.rand.next()).toString(16) + Math.abs(context.rand.next()).toString(16) + Math.abs(context.rand.next()).toString(16),
        dummyVaccineCode: Math.abs(context.rand.next()).toString(16) + Math.abs(context.rand.next()).toString(16),
        birthday: `${context.rand.nextInt(9999, 2000)}-${context.rand.nextInt(12, 1)}-${context.rand.nextInt(28, 1)}`,
    };

    if (__ITER % 2 === 1 && Object.keys(context.users).length > 0) {
        modifyOrUnRegister(context);
    } else {
        register(context, iterData);
    }
}

function register(context, iterData, modifyOldItem = null) {
    const { dummyUserId, dummyVaccineCode, birthday } = iterData;
    Util.verbose(["iter:", __ITER, "vu:", __VU, "dummyUserId:", dummyUserId]);

    const surveyConfig = Api.getSurveyConfigItem();
    const calendarItemInfo = Api.getCalendarItemInfo();

    const /** @type {any[]} */ surveySchema = surveyConfig["data"]["surveySchema"];
    const targetSurveySchema = surveySchema.filter((arr) => Object.keys(arr).includes("selectedLargeCategory")).shift();
    if (!targetSurveySchema) {
        fail("get /survey-configs/getItem selectedLargeCategory error");
    }

    const selectedLargeCategory = targetSurveySchema.selectedLargeCategory;
    const venues = selectedLargeCategory.children; // [0]: 1回目, [1]: 2回目
    const venue = venues[0].children[context.rand.nextInt(venues[0].children.length - 1)] // [0]: A会場, [1]: B会場, [2]: C会場 | 1回目の中から適当に決める

    const categoryInfoReq = http.get(`${baseUrl}/db/calendars/info/${encodeURIComponent(venue.id)}`, { tags: { trace: "/calendars/info/id" } });
    const categoryInfo = categoryInfoReq.json();
    const categoryInfoCheck = check(categoryInfo, {
        "get /calendars/info/id OK": (r) => !!r["comaList"],
    });
    if (!categoryInfoCheck) {
        fail(`get /calendars/info/id error: ${categoryInfoReq.status}, ${JSON.stringify(categoryInfo)}`);
    }
    const comas = Object.keys(categoryInfo["comaList"]);
    const selectedComa = comas[context.rand.nextInt(comas.length - 1)];

    const tagLabels = Api.getTagLabels();
    const categoriesTree = Api.getCategoriesTree();
    const calendars = Api.getCalendars();

    const scheduleReq = http.get(`${baseUrl}/db/calendars/schedule/${encodeURIComponent(venue.id)}?start_day=${calendarStartDay}&end_day=${calendarEndDay}`, { tags: { trace: "/calendars/schedule/id" } });
    // const schedule = scheduleReq.json();

    const checkReservationPayload = {
        surveyId,
        itemKey: targetSurveySchema.itemKey,
        userId: dummyUserId,
        from: null, // ?
        to: null, // ?
        targetDay,
        maxCount: 0, // ?
        maxCountOfDay: 0, // ?
        dayCheckOnly: true
    };
    //@ts-ignore
    const checkReservationReq = http.post(`${baseUrl}/db/survey-results/checkReservation`, JSON.stringify(checkReservationPayload), {
        headers: {
            "Content-Type": "application/json",
            __test__user: dummyUserId,
        },
        tags: { trace: "/survey-results/checkReservation" }
    });


    const checkReservation = checkReservationReq.json();
    const checkReservationCheck = check(checkReservation, {
        "post /survey-results/checkReservation OK": (r) => r["result"] === "OK",
    });
    if (!checkReservationCheck) {
        fail(`post /survey-results/checkReservation error: ${checkReservationReq.status}, ${JSON.stringify(checkReservation)}`);
    }

    const { 
        vaccineCodePayloadItemKey, 
        birthdayPayloadItemKey, 
        sexPayloadItemKey,
        venuePayloadItemKey,
        countPayloadItemKey,
    } = Util.surveySchemaItemKeys(surveySchema);
    
    const now = new Date().getTime();

    const vaccineCodePayload = {
        userId: dummyUserId,
        surveyId,
        value: `${dummyVaccineCode}`,
        partitionKey: `${surveyId}#${dummyUserId}#${now}`,
        sortKey: `${vaccineCodePayloadItemKey}#${dummyVaccineCode}`,
        itemKey: vaccineCodePayloadItemKey,
        userSearchKey: `${vaccineCodePayloadItemKey}#${dummyVaccineCode}`,
        check: "未対応"
    };
    const birthdayPayload = {
        userId: dummyUserId,
        surveyId,
        value: birthday,
        partitionKey: `${surveyId}#${dummyUserId}#${now}`,
        sortKey: `${birthdayPayloadItemKey}#${birthday}`,
        itemKey: birthdayPayloadItemKey,
        userSearchKey: `${birthdayPayloadItemKey}#${birthday}`,
        check: "未対応"
    };
    const sexConfig = surveySchema.find((schema) => schema.title === "性別");
    const sex = sexConfig.options[context.rand.nextInt(sexConfig.options.length - 1)];
    const sexPayload = {
        userId: dummyUserId,
        surveyId,
        value: sex,
        partitionKey: `${surveyId}#${dummyUserId}#${now}`,
        sortKey: `${sexPayloadItemKey}#${sex}`,
        itemKey: sexPayloadItemKey,
        userSearchKey: `${sexPayloadItemKey}#${sex}`,
        check: "未対応"
    };
    const venuePayload = {
        userId: dummyUserId,
        surveyId,
        value: `${venue.id}_0|${targetDay}|${selectedComa}`,
        partitionKey: `${surveyId}#${dummyUserId}#${now}`,
        sortKey: `${venuePayloadItemKey}#${venue.id}_0|${targetDay}|${selectedComa}`,
        itemKey: venuePayloadItemKey,
        userSearchKey: `${venuePayloadItemKey}#${venue.id}_0|${targetDay}|${selectedComa}`,
        check: "未対応"
    };
    const countPayload = {
        userId: dummyUserId,
        surveyId,
        value: "1回目",
        partitionKey: `${surveyId}#${dummyUserId}#${now}`,
        sortKey: `${countPayloadItemKey}#1回目`,
        itemKey: countPayloadItemKey,
        userSearchKey: `${countPayloadItemKey}#1回目`,
        check: "未対応"
    };

    const reservationPutItemPayload = {};
    const reservationPutItemDataPayload = [
        vaccineCodePayload,
        birthdayPayload,
        sexPayload,
        venuePayload,
        countPayload
    ];
    let putItemTraceTag = "/survey-results/putItem_register";
    if (modifyOldItem) {
        // @ts-ignore
        reservationPutItemDataPayload.push({
            oldPartitionKey: modifyOldItem.partitionKey,
        });
        reservationPutItemPayload.subData = {
            checkStatus: "取り消し",
            items: modifyOldItem.data,
            surveyId,
        };
        putItemTraceTag = "/survey-results/putItem_modify";
    }
    reservationPutItemPayload.data = reservationPutItemDataPayload;
    const reservationPutItemReq = http.post(`${baseUrl}/db/survey-results/putItem`, JSON.stringify(reservationPutItemPayload), {
        headers: {
            "Content-Type": "application/json",
            __test__user: dummyUserId,
        },
        tags: { trace: putItemTraceTag }
    });
    const reservationPutItem = reservationPutItemReq.json();
    const reservationPutItemCheck = check(reservationPutItem, {
        "post /survey-results/putItem OK": (r) => r["result"] === "OK",
    });
    if (!reservationPutItemCheck) {
        fail(`post /survey-results/putItem error: ${reservationPutItemReq.status}, ${JSON.stringify(reservationPutItem)}`);
    }

    const random = context.rand.nextInt(100);
    if (cancel !== 0 && random <= cancel) {
        context.users[dummyUserId] = Object.assign({}, iterData, { sex, type: "unRegiter" });
    } else if (edit !== 0 && random >= 1 - (edit)) {
        context.users[dummyUserId] = Object.assign({}, iterData, { sex, type: "modify" });
    }
}

function modifyOrUnRegister(context) {
    const user = Object.keys(context.users).shift();
    if (!user) {
        fail(`unknown user: '${user}', ${context.users}`);
    }
    const iterData = Object.assign({}, context.users[user]);
    delete context.users[user];

    const { dummyUserId, dummyVaccineCode, birthday, sex, type } = iterData;
    Util.verbose(["iter:", __ITER, "vu:", __VU, "dummyUserId:", dummyUserId]);

    const surveyConfig = Api.getSurveyConfigItem();
    const categoriesTree = Api.getCategoriesTree();
    const calendarItemInfo = Api.getCalendarItemInfo();

    const /** @type {any[]} */ surveySchema = surveyConfig["data"]["surveySchema"];
    const { venuePayloadItemKey, vaccineCodePayloadItemKey, birthdayPayloadItemKey, sexPayloadItemKey } = Util.surveySchemaItemKeys(surveySchema);
    const filterQueryPayload = {
        queryParams: {
            surveyId,
            surveyResults: [
                {
                    itemKey: vaccineCodePayloadItemKey,
                    title: "接種券番号",
                    value: dummyVaccineCode,
                },
                {
                    itemKey: birthdayPayloadItemKey,
                    title: "生年月日",
                    value: birthday,
                },
                {
                    itemKey: sexPayloadItemKey,
                    title: "性別",
                    value: sex,
                },
            ],
        },
        requestingUserId: dummyUserId,
    };
    //@ts-ignore
    const filterQueryReq = http.post(`${baseUrl}/db/survey-results/filterQuery`, JSON.stringify(filterQueryPayload), {
        headers: {
            "Content-Type": "application/json",
            __test__user: dummyUserId,
        },
        tags: { trace: "/survey-results/filterQuery" }
    });
    const filterQuery = filterQueryReq.json();
    const filterQueryCheck = check(filterQuery, {
        "get /survey-results/filterQuery OK": (r) => r["result"] === "OK",
    });
    if (!filterQueryCheck) {
        fail(`get /survey-results/filterQuery error: ${filterQueryReq.status}, ${JSON.stringify(filterQuery)}, ${JSON.stringify(filterQueryPayload)}`);
    }

    const putUserIdPayloadKeys = filterQuery["data"].map(data => data.data).flat().map(data => ({partitionKey: data.partitionKey, sortKey: data.sortKey}));
    const putUserIdPayload = {
        userId: dummyUserId,
        keys: putUserIdPayloadKeys,
    }
    //@ts-ignore
    const putUserIdReq = http.post(`${baseUrl}/db/survey-results/putUserId`, JSON.stringify(putUserIdPayload), {
        headers: {
            "Content-Type": "application/json",
            __test__user: dummyUserId,
        },
        tags: { trace: "/survey-results/putUserId" }
    });
    const putUserId = putUserIdReq.json();
    const putUserIdCheck = check(putUserId, {
        "get /survey-results/putUserId OK": (r) => r["result"] === "OK",
    });
    if (!putUserIdCheck) {
        fail(`get /survey-results/putUserId error: ${putUserIdReq.status}, ${JSON.stringify(putUserId)}`);
    }

    const categoriesReq = http.get(`${baseUrl}/db/calendars/categories`, { tags: { trace: "/calendars/categories" } });

    const tagLabels = Api.getTagLabels();
    const calendars = Api.getCalendars();

    const targetParentCategories = [];

    const /** @type {any[]} */ filterQueryData = filterQuery["data"];
    filterQueryData.forEach((data) => {
        const /** @type {any[]} */ innerData = data.data;
        const venue = innerData.find((d) => d.itemKey = venuePayloadItemKey);
        if (!venue) {
            fail("get /survey-results/filterQuery venue error");
        }
        const values = venue.value.split("|");
        if (values.length === 0) {
            fail("get /survey-results/filterQuery venue value error");
        }
        const category = `${values[0]}`;
        const parent = category.replace(/^(.*?)_0$/, function(){return arguments[1]});
        if (!targetParentCategories.includes(parent)) {
            const parentReq = http.get(`${baseUrl}/db/calendars/item_info/${encodeURIComponent(parent)}`, { tags: { trace: "/calendars/item_info/id" } });
        }
        const categoryReq = http.get(`${baseUrl}/db/calendars/item_info/${encodeURIComponent(category)}`, { tags: { trace: "/calendars/item_info/id" } });
    });

    const modifyTarget = filterQuery["data"].shift();
    if (!modifyTarget) {
        fail(`get /survey-results/filterQuery data error`);

    }

    switch (type) {
        case "modify":
            modify(context, iterData, modifyTarget);
            break;
        case "unRegiter":
            unRegiter(context, iterData, modifyTarget);
            break;
        default:
            fail(`unknown type: '${type}'`);
            break;
    }
}

function modify(context, iterData, modifyOldItem) {
    register(context, iterData, modifyOldItem);
}

function unRegiter(context, iterData, modifyOldItem) {
    const { dummyUserId } = iterData;

    const /** @type {any[]} */ data = modifyOldItem.data;
    const deleteData = data.map((d) => ({
        userId: d.userId,
        surveyId: d.surveyId,
        value: d.value,
        partitionKey: d.partitionKey,
        sortKey: d.sortKey,
        // itemKey: d.itemKey,
        itemKey: d.sortKey.split("#").shift(), // なぜかitemKeyが化ける事象が起こる。とりあえずdirty hack
        userSearchKey: d.userSearchKey,
        check: "キャンセル",
    }));

    //@ts-ignore
    const cancelItemReq = http.post(`${baseUrl}/db/survey-results/cancelItem`, JSON.stringify(deleteData), {
        headers: {
            "Content-Type": "application/json",
            __test__user: dummyUserId,
        },
        tags: { trace: "/survey-results/cancelItem" }
    });
    const cancelItem = cancelItemReq.json();
    const cancelItemCheck = check(cancelItem, {
        "get /survey-results/cancelItem OK": (r) => r["result"] === "OK",
    });
    if (!cancelItemCheck) {
        fail(`get /survey-results/cancelItem error: ${cancelItemReq.status}, ${JSON.stringify(cancelItem)}, ${dummyUserId}, ${JSON.stringify(deleteData)}`);
    }
}

const Api = {
    getSurveyConfigItem() {
        const surveyConfigReq = http.get(`${baseUrl}/db/survey-configs/getItem?surveyId=${surveyId}`, { tags: { trace: "/survey-configs/getItem" } });
        const surveyConfig = surveyConfigReq.json();
        const surveyConfigCheck = check(surveyConfig, {
            "get /survey-configs/getItem OK": (r) => r["result"] === "OK",
            "get /survey-configs/getItem has data.surveySchema": (r) => r["data"] && r["data"]["surveySchema"],
        });
        if (!surveyConfigCheck) {
            fail(`get /survey-configs/getItem error: ${surveyConfigReq.status}, ${JSON.stringify(surveyConfig)}`);
        }
        return surveyConfig;
    },
    getTagLabels() {
        const tagLabelsReq = http.get(`${baseUrl}/db/calendars/tag_labels`, { tags: { trace: "/calendars/tag_labels" } });
        return tagLabelsReq.json();
    },
    getCategoriesTree() {
        const categoriesTreeReq = http.get(`${baseUrl}/db/calendars/categories_tree`, { tags: { trace: "/calendars/categories_tree" } });
        return categoriesTreeReq.json();
    },
    getCalendars() {
        const calendarsReq = http.get(`${baseUrl}/db/calendars/getCalendars`, { tags: { trace: "/calendars/getCalendars" } });
        return calendarsReq.json();
    },
    getCalendarItemInfo() {
        const calenderItemInfoReq = http.get(`${baseUrl}/db/calendars/item_info/all`, { tags: { trace: "/calendars/item_info/all" } });
        return calenderItemInfoReq.json();
    }
};

const Util = {
    surveySchemaItemKeys(surveySchema) {
        const vaccineCodePayloadItemKey = surveySchema.find((schema) => schema.title === "接種券番号").itemKey;
        const birthdayPayloadItemKey = surveySchema.find((schema) => schema.title === "生年月日").itemKey;
        const sexPayloadItemKey = surveySchema.find((schema) => schema.title === "性別").itemKey;
        const venuePayloadItemKey = surveySchema.find((schema) => schema.title === "分類").itemKey;
        const countPayloadItemKey = surveySchema.find((schema) => schema.title === "接種回数").itemKey;
        return {
            vaccineCodePayloadItemKey,
            birthdayPayloadItemKey,
            sexPayloadItemKey,
            venuePayloadItemKey,
            countPayloadItemKey,
        };
    },
    XorShift(seed) {
        const obj = {
            x: 123456789,
            y: 362436069,
            z: 521288629,
            w: seed,
        };
        obj.__proto__.next = function() {
            let t;
            // @ts-ignore
            t = this.x ^ (this.x << 11);
            this.x = this.y; this.y = this.z; this.z = this.w;
            // @ts-ignore
            return this.w = (this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8)); 
        }
        obj.__proto__.nextInt = function(max, min = 0) {
            const r = Math.abs(this.next());
            return min + (r % (max + 1 - min));
        }
        return obj;
    },
    verbose(args) {
        if (verbose) {
            console.log.apply(console, args);
        }
    }
};