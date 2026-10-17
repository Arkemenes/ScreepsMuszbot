"use strict";
module.exports = function (project, assert) {
    const confirm = require(require("path").join(project, "src/utils/boostConfirmation"));
    const k = { boosts: { work: { XLH2O: { build: 2 } } }, toughType: "tough", mineralPerPart: 30, energyPerPart: 20 };
    const body = [{ type: "work", hits: 100 }, { type: "move", hits: 100 }, { type: "work", hits: 100 }];
    const stock = { mineral: 60, energy: 40 }, clone = (value) => JSON.parse(JSON.stringify(value));
    const before = JSON.stringify({ body, stock });
    const receipt = confirm.capture(body, "XLH2O", 2, stock, k, true);
    assert(receipt.predictedSelectedIndexes.join() === "2,0" && JSON.stringify({ body, stock }) === before,
        "0149 boost confirmation: bounded receipt records full body and engine prefix without mutating input");
    let after = clone(body); after[2].boost = "XLH2O"; after[0].boost = "XLH2O";
    let r = confirm.reconcile(receipt, after, { mineral: 0, energy: 0 }, k);
    assert(r.status === "confirmed" && r.partsConfirmed === 2 && r.livePartsConfirmed === 2 && r.consumed.energy === 40 && !r.partial,
        "0149 boost confirmation: full body changes and exact stock costs agree on complete application");
    after = clone(body); after[2].boost = "XLH2O";
    r = confirm.reconcile(receipt, after, { mineral: 30, energy: 20 }, k);
    assert(r.status === "confirmed" && r.partial && r.remainingCount === 1 && r.confirmedIndexes.join() === "2" && !r.allowReapply,
        "0149 partial confirmation: only a real prefix is confirmed, and another application needs a fresh decision");
    after[2].hits = 0;
    r = confirm.reconcile(receipt, after, { mineral: 30, energy: 20 }, k);
    assert(r.status === "confirmed" && r.partsConfirmed === 1 && r.livePartsConfirmed === 0 && r.consumed.mineral === 30,
        "0149 boost confirmation: damage after submission reduces useful capacity without reversing the spent resources");
    after = clone(body); after[0].boost = "XLH2O";
    assert(confirm.reconcile(receipt, after, { mineral: 30, energy: 20 }, k).status === "uncertain",
        "0149 boost confirmation: selecting an arbitrary live index instead of the prefix is not attributed");
    after = clone(body); after[2].boost = "XLH2O"; after[1].boost = "other";
    assert(confirm.reconcile(receipt, after, { mineral: 30, energy: 20 }, k).status === "uncertain",
        "0149 boost confirmation: mutation outside predicted indexes is caught by whole-body reconciliation");
    after = clone(body); after[2].boost = "XLH2O";
    for (const finalStock of [{ mineral: 30, energy: 40 }, { mineral: 60, energy: 20 }, { mineral: NaN, energy: 20 }, { mineral: 0, energy: 0 }])
        assert(confirm.reconcile(receipt, after, finalStock, k).status === "uncertain",
            "0149 boost confirmation: matching body alone cannot attribute inconsistent or unknown stock changes");
    r = confirm.reconcile(receipt, clone(body), stock, k);
    assert(r.status === "not-applied" && r.partsConfirmed === 0 && r.consumed.energy === 0 && !r.allowReapply,
        "0149 boost confirmation: native OK with unchanged world is not fabricated success");
    assert(confirm.reconcile(receipt, after, { mineral: 30, energy: 20 }, { ...k, energyPerPart: 21 }).reason === "mechanics-changed",
        "0149 boost confirmation: recovery with changed engine costs stays uncertain");
    assert(confirm.capture(body, "XLH2O", 2, stock, k, false).status === "uncertain", "0149 boost confirmation: receipt requires exclusive lab and creep intent custody");
    assert(confirm.capture(body, "XLH2O", 0, stock, k, true).status === "uncertain", "0149 boost confirmation: zero count cannot create a submission receipt");
    const dead = clone(body); dead[2].hits = 0;
    assert(confirm.capture(dead, "XLH2O", 2, stock, k, true).status === "uncertain", "0149 boost confirmation: unsafe dead prefix cannot enter the pilot submission path");
    const corrupt = clone(receipt); corrupt.predictedSelectedIndexes = [0, 2];
    assert(confirm.reconcile(corrupt, after, { mineral: 30, energy: 20 }, k).status === "uncertain", "0149 boost confirmation: corrupt recovery receipt never authorizes replay");
};
