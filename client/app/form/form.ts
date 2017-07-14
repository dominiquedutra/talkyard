/*
 * Copyright (c) 2016 Kaj Magnus Lindberg
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

/// <reference path="../../typedefs/jquery/jquery.d.ts" />
/// <reference path="../plain-old-javascript.d.ts" />
/// <reference path="../prelude.ts" />
/// <reference path="../rules.ts" />
/// <reference path="../page-methods.ts" />
/// <reference path="../more-bundle-not-yet-loaded.ts" />

//------------------------------------------------------------------------------
   module debiki2.form {
//------------------------------------------------------------------------------

const d = { i: debiki.internal, u: debiki.v0.util };
const $: any = d.i.$;  // type JQuery –> Typescript won't find parseHTML :- (


export function activateAnyCustomForm() {
   let $forms = $('.dw-p-bd form');
   $forms.on('submit', function (event) {
      let $form = $(this);
      let namesAndValues = $form.serializeArray();
      let doWhat = _.find(namesAndValues, (nv: any) => nv.name === 'doWhat');
      if (!doWhat)
        return;

      event.preventDefault();
      event.stopPropagation();

      if (doWhat.value === 'CreateTopic') {
        Server.submitCustomFormAsNewTopic(namesAndValues);
      }
      else if (doWhat.value === 'SignUp') {
        morebundle.loginIfNeeded(LoginReason.SignUp);
      }
      else if (doWhat.value === 'SignUpSubmitUtx') {  // [plugin]
        morebundle.loginIfNeeded(LoginReason.SignUp, '/-/redir-to-my-last-topic', function() {
          Server.submitUsabilityTestingRequest(namesAndValues);
        });
      }
      else if (doWhat.value === 'SubmitToThisPage') {
        Server.submitCustomFormAsJsonReply(namesAndValues, function() {
          // This messes with stuff rendered by React, but works fine nevertheless.
          const thanks = $form.find('.FormThanks');
          $form.replaceWith(
            thanks.length ? thanks : $.parseHTML('<p class="esFormThanks">Thank you.</p>'));
        });
        $form.find('button[type=submit]').text("Submitting ...").attr('disabled', 'disabled');
      }
      else {
        die(`Unknown input name=doWhat value: '${doWhat.value}' [EdE8402F4]`);
      }
   });
}

//------------------------------------------------------------------------------
   }
//------------------------------------------------------------------------------
// vim: fdm=marker et ts=2 sw=2 tw=0 fo=r list
