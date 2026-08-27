import type { Metadata } from "next";
import RetailPilotClient from "./RetailPilotClient";
export const metadata:Metadata={title:"4REGN Plain Tee Retail Pilot",robots:{index:false,follow:false}};
export default function RetailPilotPage(){return <RetailPilotClient/>}
