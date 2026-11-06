use anchor_lang::prelude::*;

declare_id!("CKhrEj7ZyX49ZuaWGLubLyaSBwtQje3wLDaWA9UeYdEP");

#[program]
pub mod test_deploy {
    use super::*;

    pub fn create_poll(ctx: Context<CreatePoll>, question: String) -> Result<()> {
        let poll = &mut ctx.accounts.poll;
        poll.question = question;
        poll.votes_a = 0;
        poll.votes_b = 0;
        poll.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, choice: u8) -> Result<()> {
        require!(choice == 0 || choice == 1, VoteError::InvalidChoice);
        let poll = &mut ctx.accounts.poll;
        if choice == 0 {
            poll.votes_a += 1;
        } else {
            poll.votes_b += 1;
        }
        ctx.accounts.voter_record.voter = ctx.accounts.voter.key();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePoll<'info> {
    #[account(init, payer = authority, space = 8 + Poll::INIT_SPACE,
        seeds = [b"poll", authority.key().as_ref()], bump)]
    pub poll: Account<'info, Poll>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub poll: Account<'info, Poll>,
    #[account(init, payer = voter, space = 8 + VoterRecord::INIT_SPACE,
        seeds = [b"vote", poll.key().as_ref(), voter.key().as_ref()], bump)]
    pub voter_record: Account<'info, VoterRecord>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Poll {
    #[max_len(200)]
    pub question: String,
    pub votes_a: u64,
    pub votes_b: u64,
    pub authority: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct VoterRecord {
    pub voter: Pubkey,
}

#[error_code]
pub enum VoteError {
    #[msg("Choice must be 0 or 1")]
    InvalidChoice,
}
