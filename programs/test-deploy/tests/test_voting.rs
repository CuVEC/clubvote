use solana_message::Instruction;
use anchor_lang::prelude::*;
use anchor_lang::{InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_transaction::Transaction;

fn read_votes(svm: &LiteSVM, poll: &Pubkey) -> (u64, u64) {
    let account = svm.get_account(poll).expect("poll account missing");
    let data = &account.data;
    let qlen = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
    let a_off = 12 + qlen;
    let votes_a = u64::from_le_bytes(data[a_off..a_off + 8].try_into().unwrap());
    let votes_b = u64::from_le_bytes(data[a_off + 8..a_off + 16].try_into().unwrap());
    (votes_a, votes_b)
}

#[test]
fn voting_flow() {
    let program_id = test_deploy::ID;
    let mut svm = LiteSVM::new();
    let _ = svm.add_program_from_file(program_id, "../../target/deploy/test_deploy.so");

    let authority = Keypair::new();
    let _ = svm.airdrop(&authority.pubkey(), 10_000_000_000);

    let (poll_pda, _) = Pubkey::find_program_address(
        &[b"poll", authority.pubkey().as_ref()],
        &program_id,
    );
    let ix = Instruction {
        program_id,
        accounts: test_deploy::accounts::CreatePoll {
            poll: poll_pda,
            authority: authority.pubkey(),
            system_program: Pubkey::new_from_array([0u8; 32]),
        }
        .to_account_metas(None),
        data: test_deploy::instruction::CreatePoll {
            question: "Best club event this semester?".to_string(),
        }
        .data(),
    };
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&authority.pubkey()),
        &[&authority],
        svm.latest_blockhash(),
    );
    assert!(svm.send_transaction(tx).is_ok());
    assert_eq!(read_votes(&svm, &poll_pda), (0, 0));

    let (record_a, _) = Pubkey::find_program_address(
        &[b"vote", poll_pda.as_ref(), authority.pubkey().as_ref()],
        &program_id,
    );
    let ix = Instruction {
        program_id,
        accounts: test_deploy::accounts::Vote {
            poll: poll_pda,
            voter_record: record_a,
            voter: authority.pubkey(),
            system_program: Pubkey::new_from_array([0u8; 32]),
        }
        .to_account_metas(None),
        data: test_deploy::instruction::Vote { choice: 0 }.data(),
    };
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&authority.pubkey()),
        &[&authority],
        svm.latest_blockhash(),
    );
    assert!(svm.send_transaction(tx).is_ok());
    assert_eq!(read_votes(&svm, &poll_pda), (1, 0));

    let voter = Keypair::new();
    let _ = svm.airdrop(&voter.pubkey(), 10_000_000_000);
    let (record_b, _) = Pubkey::find_program_address(
        &[b"vote", poll_pda.as_ref(), voter.pubkey().as_ref()],
        &program_id,
    );
    let ix = Instruction {
        program_id,
        accounts: test_deploy::accounts::Vote {
            poll: poll_pda,
            voter_record: record_b,
            voter: voter.pubkey(),
            system_program: Pubkey::new_from_array([0u8; 32]),
        }
        .to_account_metas(None),
        data: test_deploy::instruction::Vote { choice: 1 }.data(),
    };
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&voter.pubkey()),
        &[&voter],
        svm.latest_blockhash(),
    );
    assert!(svm.send_transaction(tx).is_ok());
    assert_eq!(read_votes(&svm, &poll_pda), (1, 1));

    let ix = Instruction {
        program_id,
        accounts: test_deploy::accounts::Vote {
            poll: poll_pda,
            voter_record: record_b,
            voter: voter.pubkey(),
            system_program: Pubkey::new_from_array([0u8; 32]),
        }
        .to_account_metas(None),
        data: test_deploy::instruction::Vote { choice: 1 }.data(),
    };
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&voter.pubkey()),
        &[&voter],
        svm.latest_blockhash(),
    );
    assert!(svm.send_transaction(tx).is_err());
    assert_eq!(read_votes(&svm, &poll_pda), (1, 1));

    println!("voting flow OK: create -> A=1, B=1 -> double vote rejected");
}
