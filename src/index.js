// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");
import { hexToString } from "viem";
import { Router } from "cartesi-router";
import { Wallet, Notice, Error_out } from "cartesi-wallet";
import { InputBox__factory } from "@cartesi/rollups";

const etherPortalAddress = "0xFfdbe43d4c855BF7e0f105c400A50857f53AB044";
const erc20PortalAddress = "0x9C21AEb2093C32DDbC53eEF24B873BDCd1aDa1DB";
const erc721PortalAddress = "0x237F8DD094C0e47f4236f12b4Fa01d6Dae89fb87";
const dAppAddressRelayContract = "0xF5DE34d6BbC0446E2a45719E718efEbaaE179daE";

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

const wallet = new Wallet(new Map())

const router = new Router(wallet)

const send_request = async (output) => {
 if (output) {
   let endpoint;
   console.log("type of output", output.type);

if (output.type == "notice") {
     endpoint = "/notice";
   } else if (output.type == "voucher") {
     endpoint = "/voucher";
   } else {
     endpoint = "/report";
   }

console.log(`sending request ${typeof output}`);
   const response = await fetch(rollup_server + endpoint, {
     method: "POST",
     headers: {
       "Content-Type": "application/json",
     },
     body: JSON.stringify(output),
   });
   console.debug(
     `received ${output.payload} status ${response.status} body ${response.body}`
   );
 } else {
   output.forEach((value) => {
     send_request(value);
   });
 }
};

async function handle_advance(data) {
 console.log("Received advance request data " + JSON.stringify(data));
 try {
   const payload = data.payload;
   const msg_sender  = data.metadata.msg_sender;
   console.log("msg sender is", msg_sender.toLowerCase());

const payloadStr = hexToString(payload);

console.log(payloadStr)

//Deposit ether
   if (
     msg_sender.toLowerCase() ===
     etherPortalAddress.toLowerCase()
   ) {
     try {
       return router.process("ether_deposit", payload);
     } catch (e) {
       return new Error_out(`failed to process Ether deposit ${payload} ${e}`);
     }
   }

// deposit erc20
   if (
     msg_sender.toLowerCase() ===
     erc20PortalAddress.toLowerCase()
   ) {
     try {
       return router.process("erc20_deposit", payload);
     } catch (e) {
       return new Error_out(`failed to process ERC20Deposit ${payload} ${e}`);
     }
   }
 // deposit erc721
   if (
     msg_sender.toLowerCase() ===
     erc721PortalAddress.toLowerCase()
   ) {
     try {
       return router.process("erc721_deposit", payload);
     } catch (e) {
       return new Error_out(`failed to process ERC721Deposit ${payload} ${e}`);
     }
   }

try {
      const jsonpayload = JSON.parse(payloadStr);
      console.log("payload is");
      return router.process(jsonpayload.method, data);
    } catch (e) {
      return new Error_out(`failed to process command ${payloadStr} ${e}`);
    }

} catch (e) {
   console.error(e);
   return new Error_out(`failed to process advance_request ${e}`);
 }
}

async function handle_inspect(data) {
 console.log("Received inspect request data " + JSON.stringify(data));
 const url = hexToString(data.payload).split("/");
console.log(url)
return router.process(url[0], url[1]); // balance/account
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();

      var typeq = rollup_req.request_type;
      console.log(typeq)
      var handler;
      if (typeq === "inspect_state") {
        handler = handlers.inspect_state;
      } else {
        handler = handlers.advance_state;
      }
      var output = await handler(rollup_req.data);
      finish.status = "accept";
      if (output instanceof Error_out) {
        finish.status = "reject";
      }
      // send the request
      await send_request(output);
    }
  }
})();
