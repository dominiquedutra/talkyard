/// <reference path="../test-types.ts"/>

import * as _ from 'lodash';
import assert = require('../utils/ty-assert');
import server = require('../utils/server');
import utils = require('../utils/utils');
import { buildSite } from '../utils/site-builder';
import pagesFor = require('../utils/pages-for');
import settings = require('../utils/settings');
import lad = require('../utils/log-and-die');
import c = require('../test-constants');

declare var browser: any;
declare var browserA: any;
declare var browserB: any;

let richBrowserA;
let richBrowserB;
let owen: Member;
let owensBrowser;
let corax: Member;
let maja: Member;
let majasBrowser;
let strangersBrowser;

let siteIdAddress: IdAddress;
let siteId;

let forum: TwoPagesTestForum;

const apiSecret: TestApiSecret = {
  nr: 1,
  userId: c.SysbotUserId,
  createdAt: c.MinUnixMillis,
  deletedAt: undefined,
  isDeleted: false,
  secretKey: 'publicE2eTestSecretKeyAbc123',
};

const categoryExtId = 'cat_ext_id';

const pageOneToUpsert = {
  // id: assigned by the server
  extId: 'ups_page_one_ext_id',
  pageType: c.TestPageRole.Idea,
  categoryRef: 'extid:' + categoryExtId,
  // The author won't get notified about this new page.
  authorRef: 'username:corax',
  title: 'UpsPageOneTitle',
  body: 'UpsPageOneBody',
};


/* Later: Make  @mentions  work also via the upsert API?

const pageTwoToUpsert = {
  extId: 'UpsPageTwoExtId',
  pageType: c.TestPageRole.Question,
  categoryRef: 'extid:' + categoryExtId,
  authorRef: 'username:owen_owner',
  title: 'UpsPageTwoTitle',
  body: 'UpsPageTwoBody mentions @michael',
};

const pageTwoEditedToUpsert = {
  ...pageTwoToUpsert,
  title: 'Page Two Edited Title',
  body: 'Page two edited body, mentions @maria',
  slug: 'page-two-edited-slug',
  pageType: c.TestPageRole.Question,
};  */


describe("api-upsert-page-notfs   TyT502RKTLXM296", () => {

  if (settings.prod) {
    console.log("Skipping this spec — the server needs to have upsert conf vals enabled."); // E2EBUG
    return;
  }


  // ----- Create site, with API enabled

  it("import a site", () => {
    const builder = buildSite();
    forum = builder.addTwoPagesForum({
      title: "Ups Pages E2E Test",
      members: ['owen', 'corax', 'maja', 'maria', 'michael'],
    });
    assert.refEq(builder.getSite(), forum.siteData);
    const site: SiteData2 = forum.siteData;
    site.settings.enableApi = true;
    site.apiSecrets = [apiSecret];

    owen = forum.members.owen;
    site.pageNotfPrefs = [{
      memberId: owen.id,
      notfLevel: c.TestPageNotfLevel.NewTopics,
      wholeSite: true,
    }];

    siteIdAddress = server.importSiteData(forum.siteData);
    siteId = siteIdAddress.id;
  });

  it("initialize people", () => {
    richBrowserA = _.assign(browserA, pagesFor(browserA));
    richBrowserB = _.assign(browserB, pagesFor(browserB));

    owensBrowser = richBrowserA;

    corax = forum.members.corax;

    maja = forum.members.maja;
    majasBrowser = richBrowserB;
    strangersBrowser = richBrowserB;
  });


  // ----- Assign ext id to a category   (dupl code [05KUDTEDW24])

  it("Owen goes to Category A, logs in", () => {
    owensBrowser.forumTopicList.goHere({
        origin: siteIdAddress.origin,
        categorySlug: forum.categories.categoryA.slug });
    owensBrowser.topbar.clickLogin();
    owensBrowser.loginDialog.loginWithPassword(owen);
  });

  it("Opens the category", () => {
    owensBrowser.forumButtons.clickEditCategory();
  });

  it("... edits it: assigns an External ID", () => {
    owensBrowser.categoryDialog.fillInFields({ extId: categoryExtId });
  });

  it("... saves", () => {
    owensBrowser.categoryDialog.submit();
  });


  // ----- Owen and Maja subscribes to Category A notifications

  /*
  it("Owen goes to his notf prefs", () => {
    owensBrowser.userProfilePage.preferences.notfs.goHere(owen.username, {
        origin: siteIdAddress.origin });
  });

  it("... subscribes to new topics, whole site", () => {
    owensBrowser.userProfilePage.preferences.notfs.setSiteNotfLevel(
        c.TestPageNotfLevel.NewTopics);
  }); */

  it("Maja goes to Category A, logs in", () => {
    majasBrowser.userProfilePage.preferences.notfs.goHere(maja.username, {
        origin: siteIdAddress.origin });
    majasBrowser.complex.loginWithPasswordViaTopbar(maja);
  });

  it("Subscribes to new topics in Category A", () => {
    majasBrowser.userProfilePage.preferences.notfs.setNotfLevelForCategoryId(
        forum.categories.categoryA.id, c.TestPageNotfLevel.NewTopics);
  });


  // ----- Upsert page via API

  let upsertResponse;
  let firstUpsertedPage: any;

  it("Upsert a page", () => {
    upsertResponse = server.apiV0.upsertSimple({
      origin: siteIdAddress.origin,
      apiRequesterId: c.SysbotUserId,
      apiSecret: apiSecret.secretKey,
      data: {
        upsertOptions: { sendNotifications: true },
        pages: [pageOneToUpsert],
      },
    });
  });

  it("... gets back the upserted page in the server's response", () => {
    console.log("Page ups resp:\n\n:" + JSON.stringify(upsertResponse, undefined, 2));

    assert.equal(upsertResponse.pages.length, 1);
    firstUpsertedPage = upsertResponse.pages[0];

    assert.equal(firstUpsertedPage.urlPaths.canonical, '/-1/upspageonetitle');

    assert.equal(firstUpsertedPage.id, "1");
    assert.equal(firstUpsertedPage.pageType, c.TestPageRole.Idea);
    utils.checkNewPageFields(firstUpsertedPage, {
      categoryId: forum.categories.categoryA.id,
      authorId: corax.id,
    });
  });


  it("Owen goes to the upserted topic", () => {
    owensBrowser.go2(firstUpsertedPage.urlPaths.canonical);
  });

  it("... it has the correct title", () => {
    owensBrowser.topic.waitForPostAssertTextMatches(c.TitleNr, pageOneToUpsert.title);
  });

  it("... and body", () => {
    owensBrowser.topic.waitForPostAssertTextMatches(c.BodyNr, pageOneToUpsert.body);
  });


  // ----- Owen and Maja got notified

  it("Owen gets a notf about the new page — he's subscribed to the whole site", () => {
    server.waitUntilLastEmailMatches(
        siteIdAddress.id, owen.emailAddress,
        [owen.username, pageOneToUpsert.title, pageOneToUpsert.body], owensBrowser);
  });

  it("Maja too; she has subscribed to Category A", () => {
    server.waitUntilLastEmailMatches(
        siteIdAddress.id, maja.emailAddress,
        [maja.username, pageOneToUpsert.title, pageOneToUpsert.body], majasBrowser);
  });

  it("But no one else", () => {
    const { num, addrsByTimeAsc } = server.getEmailsSentToAddrs(siteId);
    assert.equal(num, 2, `Emails sent to: ${addrsByTimeAsc}`);
  });


  // ----- The notf links work

  let upsertedPageUrlFromEmail: string;

  it("Maja fins a page link in her email", () => {
    const email = server.getLastEmailSenTo(siteId, maja.emailAddress, majasBrowser);
    upsertedPageUrlFromEmail = utils.findFirstLinkToUrlIn(
        // Currently the link uses the page id, not url slug.
        // So, not:  + firstUpsertedPage.urlPaths.canonical
        // Instead,  /-1:
        'https?://.*/-1', email.bodyHtmlText);
    // won't work right now:
    // assert.includes(upsertedPageUrlFromEmail, firstUpsertedPage.urlPaths.canonical);
  });

  it("she clicks the link", () => {
    majasBrowser.go2(upsertedPageUrlFromEmail);
  });

  it("... sees the correct page title", () => {
    majasBrowser.topic.waitForPostAssertTextMatches(c.TitleNr, pageOneToUpsert.title);
  });

  it("... and body", () => {
    majasBrowser.topic.waitForPostAssertTextMatches(c.BodyNr, pageOneToUpsert.body);
  });

});

