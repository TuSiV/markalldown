import React from "react";
import {render,screen,cleanup} from "@testing-library/react";
import {it,expect,afterEach} from "vitest";
import {HighlightedText} from "../src/components/Visual";
afterEach(cleanup);
it("highlights literal sensitive terms without treating them as regular expressions or markup",()=>{
 render(<pre><HighlightedText text={"Company [A] and <script>plain text</script>"} terms={[{original:"Company [A]",category:"keyword"}]}/></pre>);
 expect(document.querySelector("mark")?.textContent).toBe("Company [A]");expect(document.querySelector("script")).toBeNull();expect(screen.getByText(/plain text/)).toBeTruthy();
});
