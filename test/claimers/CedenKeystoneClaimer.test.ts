import { expect, use } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { FakeContract, smock } from "@defi-wonderland/smock";
import {
  IERC721,
  ICedenClaimable,
  CedenKeystoneClaimer,
} from "../../typechain-types";

use(smock.matchers);

describe.only("KeystoneClaimer", () => {
  const MAX_TOKEN_ID = 10;
  let owner: SignerWithAddress;
  let signer: SignerWithAddress;
  let erc721Fake: FakeContract<IERC721>;
  let keystoneFake: FakeContract<ICedenClaimable>;
  let keystoneClaimer: CedenKeystoneClaimer;

  beforeEach(async () => {
    [owner, signer] = await ethers.getSigners();

    erc721Fake = await smock.fake("IERC721");
    keystoneFake = await smock.fake("ICedenClaimable");

    const KeystoneClaimer = await ethers.getContractFactory(
      "CedenKeystoneClaimer"
    );
    keystoneClaimer = await KeystoneClaimer.deploy(
      erc721Fake.address,
      MAX_TOKEN_ID
    );
    await keystoneClaimer.deployed();

    const unpauseTx = await keystoneClaimer.unpause();
    await unpauseTx.wait();

    const setKeystoneAddressTx = await keystoneClaimer.setKeystoneAddress(
      keystoneFake.address
    );
    await setKeystoneAddressTx.wait();
  });

  describe("isClaimed()", () => {
    it("should return true if token is claimed", async () => {
      erc721Fake.ownerOf.whenCalledWith(1).returns(owner.address);
      const claimTx = await keystoneClaimer.claim([1]);
      await claimTx.wait();

      const isClaimed = await keystoneClaimer.isClaimed(1);
      expect(isClaimed).to.be.true;
    });

    it("should return false if token is not claimed", async () => {
      const isClaimed = await keystoneClaimer.isClaimed(1);
      expect(isClaimed).to.be.false;
    });

    it("should revert if token id is out of range", async () => {
      await expect(keystoneClaimer.isClaimed(11)).to.be.revertedWith(
        "CedenClaimer: Invalid token ID"
      );
    });
  });

  describe("claim()", () => {
    it("should set claimed to true and keystone if called by token owner and token is not claimed", async () => {
      erc721Fake.ownerOf.whenCalledWith(1).returns(owner.address);
      erc721Fake.ownerOf.whenCalledWith(2).returns(owner.address);

      await expect(keystoneClaimer.claim([1, 2]))
        .to.emit(keystoneClaimer, "Claimed")
        .withArgs(1)
        .to.emit(keystoneClaimer, "Claimed")
        .withArgs(2)
        .to.emit(keystoneClaimer, "KeystoneClaimed")
        .withArgs(owner.address, [1, 2]);

      const isClaimed1 = await keystoneClaimer.isClaimed(1);
      const isClaimed2 = await keystoneClaimer.isClaimed(2);
      expect(isClaimed1).to.be.true;
      expect(isClaimed2).to.be.true;
      expect(keystoneFake.claim).to.have.been.calledWith(owner.address, [1, 2]);
    });

    it("should revert if paused", async () => {
      const pauseTx = await keystoneClaimer.pause();
      await pauseTx.wait();

      await expect(keystoneClaimer.claim([1])).to.be.revertedWith(
        "Pausable: paused"
      );
    });

    it("should revert if called by token owner and token is claimed", async () => {
      erc721Fake.ownerOf.whenCalledWith(1).returns(owner.address);
      const claimTx = await keystoneClaimer.claim([1]);
      await claimTx.wait();

      await expect(keystoneClaimer.claim([1])).to.be.revertedWith(
        "CedenKeystoneClaimer: Can't claim"
      );
    });

    it("should revert if called by not token owner", async () => {
      erc721Fake.ownerOf.whenCalledWith(1).returns(owner.address);
      await expect(
        keystoneClaimer.connect(signer).claim([1])
      ).to.be.revertedWith("CedenKeystoneClaimer: Can't claim");
    });
  });

  describe("setKeystoneAddress()", () => {
    it("should set Keystone address address if called by an owner", async () => {
      const newKeystoneFake = await smock.fake<ICedenClaimable>(
        "ICedenClaimable"
      );
      const setKeystoneTx = await keystoneClaimer.setKeystoneAddress(
        newKeystoneFake.address
      );
      await setKeystoneTx.wait();

      erc721Fake.ownerOf.whenCalledWith(1).returns(owner.address);
      const claimTx = await keystoneClaimer.claim([1]);
      await claimTx.wait();

      expect(newKeystoneFake.claim).to.have.been.calledWith(owner.address, [1]);
    });

    it("should revert if called by not an owner", async () => {
      const newKeystoneFake = await smock.fake<ICedenClaimable>(
        "ICedenClaimable"
      );
      await expect(
        keystoneClaimer
          .connect(signer)
          .setKeystoneAddress(newKeystoneFake.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
