/***************************************************************************
 * libancillary - black magic on Unix domain sockets
 * (C) Nicolas George
 * ancillary.h - public header
 ***************************************************************************/

/*
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *  1. Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *  2. Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 *  3. The name of the author may not be used to endorse or promote products
 *     derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#ifndef ANCILLARY_H__
#define ANCILLARY_H__

#include <stddef.h>

/***************************************************************************
 * Start of the readable part.
 ***************************************************************************/

#define ANCIL_MAX_N_FDS 960
/*
 * Maximum number of fds that can be sent or received using the "esay"
 * functions; this is so that all can fit in one page.
 */

int ancil_send_fds_with_msg(int sock, const int *fds, unsigned n_fds,
                            struct iovec *iov, size_t iovlen);
/*
 * ancil_send_fds_with_buffer(sock, n_fds, fds, buffer)
 *
 * Sends the file descriptors in the array pointed by fds, of length n_fds
 * on the socket sock.
 * buffer is a writeable memory area large enough to hold the required data
 * structures.
 * Returns: -1 and errno in case of error, 0 in case of success.
 */

int ancil_recv_fds_with_msg(int sock, int *fds, unsigned n_fds,
                            struct iovec *iov, size_t iovlen);
/*
 * ancil_recv_fds_with_buffer(sock, n_fds, fds, buffer)
 *
 * Receives *n_fds file descriptors into the array pointed by fds
 * from the socket sock.
 * buffer is a writeable memory area large enough to hold the required data
 * structures.
 * Returns: -1 and errno in case of error, the actual number of received fd
 * in case of success
 */

#define ANCIL_FD_BUFFER(n) \
  struct {                 \
    struct cmsghdr h;      \
    int fd[n];             \
  }

#endif /* ANCILLARY_H__ */