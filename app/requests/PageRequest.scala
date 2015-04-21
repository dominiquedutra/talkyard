/**
 * Copyright (C) 2012 Kaj Magnus Lindberg (born 1979)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package requests

import com.debiki.core._
import com.debiki.core.Prelude._
import controllers.Utils.parseIntOrThrowBadReq
import controllers.Utils.ValidationImplicits._
import debiki._
import debiki.DebikiHttp._
import debiki.dao.{PageDao, SiteDao}
import java.{util => ju}
import play.api.mvc.{Action => _, _}
import DbDao.PathClashException



object PageRequest {

  /**
   * Builds a PageRequest based on another DebikiRequest and a page path.
   *
   * If `fixIncorrectPath`, changes `pagePath` to the real path to the page,
   * if needed (and if the page exists). Otherwise, if  `pagePath` is
   * incorrect, throws an error 404 Not Found exception.
   * (PageActions.CheckPathAction however redirects the browser to the correct
   * path, if you specify an almost correct path (e.g. superfluous
   * trailing '/').
   */
  private def basedOnApiRequest[A](
    apiRequest: DebikiRequest[A],
    pagePath: PagePath,
    pageMustExist: Boolean = false,
    fixBadPath: Boolean = false): PageRequest[A] = {

    // Require page id (so we know for sure which page to e.g. edit).
    assErrIf(pagePath.pageId.isEmpty,
      "DwE8ISD2", s"Page id missing, pagePath: $pagePath")

    val (pageExists, okPath) = apiRequest.dao.checkPagePath(pagePath) match {
      case Some(correctPath: PagePath) =>
        // Check if another page already exist at `pagePath`? (It'd have the
        // same path, but another id.)
         if (correctPath.pageId.get != pagePath.pageId.get)
           throw PathClashException(
             existingPagePath = correctPath, newPagePath = pagePath)

        // Check for bad paths.
        if (correctPath.value != pagePath.value && !fixBadPath)
          throwNotFound("DwE305RI2", s"Mismatching page path: `$pagePath', " +
             s"should be `$correctPath'")
        // Fix any bad path:
        (true, correctPath)
      case None =>
        (false, pagePath)
    }

    if (!pageExists && pageMustExist)
      throwNotFound("DwE42Im0", s"Page not found, id: ${pagePath.pageId.get}")

    val anyPageMeta = okPath.pageId.flatMap(apiRequest.dao.loadPageMeta(_))
    if (pageExists && anyPageMeta.isEmpty)
      throwNotFound("DwE56Jb0", s"No page meta found, page id: ${pagePath.pageId.get}")

    // Dupl code, see PageActions.CheckPathAction
    val permsReq = PermsOnPageQuery(
      tenantId = apiRequest.tenantId,
      ip = apiRequest.ip,
      user = apiRequest.user,
      pagePath = okPath,
      pageMeta = anyPageMeta)

    val permsOnPage = apiRequest.dao.loadPermsOnPage(permsReq)
    if (!permsOnPage.accessPage)
      throwForbidden("DwE72XIKW2", "You are not allowed to access that page.")

    new PageRequest[A](
      sid = apiRequest.sid,
      xsrfToken = apiRequest.xsrfToken,
      browserId = apiRequest.browserId,
      user = apiRequest.user,
      pageExists = pageExists,
      pagePath = okPath,
      pageMeta = anyPageMeta,
      permsOnPage = permsOnPage,
      dao = apiRequest.dao,
      request = apiRequest.request)
  }


  /** Returns None if the page doesn't exist.
    */
  def forPageThatExists[A](apiRequest: DebikiRequest[A], pageId: String): Option[PageRequest[A]] = {
    // COULD try to remove either `lookupPagePath` on the next line, or
    // remove `checkPagePath` in PageRequest.apply(..) above.
    apiRequest.dao.lookupPagePath(pageId) match {
      case Some(pagePath) =>
        Some(PageRequest.basedOnApiRequest(
          apiRequest, pagePath, pageMustExist = true, fixBadPath = true))
      case None =>
        None
    }
  }

}



/** A page related request.
  *
  * Naming convention: Functions that assume that the page exists, and throws
  * a 404 Not Found error otherwise, are named like "thePage" or "thePageParts",
  * whilst functions that instead require an Option are named simply "page" or
  * "pageParts".
  */
class PageRequest[A](
  val sid: SidStatus,
  val xsrfToken: XsrfOk,
  val browserId: Option[BrowserId],
  val user: Option[User],
  val pageExists: Boolean,
  /** Ids of groups to which the requester belongs. */
  // userMemships: List[String],
  /** If the requested page does not exist, pagePath.pageId is empty. */
  val pagePath: PagePath,
  val pageMeta: Option[PageMeta],
  val permsOnPage: PermsOnPage,
  val dao: SiteDao,
  val request: Request[A]) extends DebikiRequest[A] {

  require(pagePath.tenantId == tenantId) //COULD remove tenantId from pagePath
  require(!pageExists || pagePath.pageId.isDefined)
  require(!pageExists || pageMeta.isDefined)

  pageMeta foreach { meta =>
    require(Some(meta.pageId) == pagePath.pageId)
  }


  def pageId: Option[String] = pagePath.pageId

  /**
   * Throws 404 Not Found if id unknown. The page id is known if it
   * was specified in the request, *or* if the page exists.
   */
  def thePageId : String = pagePath.pageId getOrElse
    throwNotFound("DwE93kD4", "Page does not exist: "+ pagePath.value)


  /**
   * The page root tells which post to start with when rendering a page.
   * By default, the page body is used. The root is specified in the
   * query string, like so: ?view=rootPostId  or ?edit=....&view=rootPostId
   */
  lazy val pageRoot: AnyPageRoot =
    request.queryString.get("view").map(rootPosts => rootPosts.size match {
      case 1 => Some(parseIntOrThrowBadReq(rootPosts.head))
      // It seems this cannot hapen with Play Framework:
      case 0 => assErr("DwE03kI8", "Query string param with no value")
      case _ => throwBadReq("DwE0k35", "Too many `view' query params")
    }) getOrElse {
      pageRole match {
        case Some(PageRole.EmbeddedComments) =>
          // There's no page body that can be used as page root, because embedded
          // pages contain comments only.
          None
        case _ =>
          DefaultPageRoot
      }
    }


  def pageRole: Option[PageRole] = pageMeta.map(_.pageRole)

  def thePageRole : PageRole = thePageMeta.pageRole

  def theParentPageId : Option[String] = thePageMeta.parentPageId

  def thePageMeta = pageMeta getOrElse throwNotFound(
    "DwE3ES58", s"No page meta found, page id: $pageId")

  lazy val ancestorIdsParentFirst_! : List[PageId] =
    dao.loadAncestorIdsParentFirst(thePageId)


  def thePathAndMeta = PagePathAndMeta(pagePath, ancestorIdsParentFirst_!, thePageMeta)


  lazy val thePageSettings: Settings = {
    if (pageExists) {
      dao.loadSinglePageSettings(thePageId)
    }
    else if (theParentPageId.isDefined) {
      dao.loadPageTreeSettings(theParentPageId.get)
    }
    else {
      dao.loadWholeSiteSettings()
    }
  }


  /** If we should include comment vote and read count statistics in the html.
    */
  def debugStats: Boolean =
    request.queryString.getEmptyAsNone("debugStats") == Some("true")

}


/** A request from a page that you provide manually (the page won't be loaded
  * from the database). EmbeddedTopicsController constructs an empty dummy page
  * when showing comments for an URL for which no page has yet been created.
  */
class DummyPageRequest[A](
  sid: SidStatus,
  xsrfToken: XsrfOk,
  browserId: Option[BrowserId],
  user: Option[User],
  pageExists: Boolean,
  pagePath: PagePath,
  pageMeta: PageMeta,
  permsOnPage: PermsOnPage,
  dao: SiteDao,
  dummyPageParts: PageParts,
  request: Request[A]) extends PageRequest[A](
    sid, xsrfToken, browserId, user, pageExists,  pagePath, Some(pageMeta),
    permsOnPage, dao, request) {

  override lazy val ancestorIdsParentFirst_! : List[PageId] = Nil

}
